const DazaarETHTweak = require('@dazaar/eth-tweak')
const payments = require('./subscription')

const MAX_SUBSCRIBER_CACHE = 500
const CHAIN_IDS = {
  mainnet: 1,
  ropsten: 3,
  rinkeby: 4,
  kovan: 42,
  classic: 61
}

module.exports = class DazaarETHPayment {
  constructor (dazaar, payment, index) {
    if (!dazaar.key) throw new Error('Dazaar key not set, did you wait for ready?')

    this.dazaar = dazaar.key
    this.seller = dazaar
    this.payment = payment
    this.index = index
    this.publicKey = DazaarETHPayment.publicKeyToBuffer((pubKey(payment)))

    if (!DazaarETHPayment.validatePublicKey(this.publicKey)) {
      throw new Error('Public key is invalid')
    }

    this.subscribers = new Map()
    this.eth = payments(this.index)

    index.start()

    this.tweak = new DazaarETHTweak({
      publicKey: this.publicKey,
      chainId: CHAIN_IDS[payment.chain || 'mainnet']
    })
  }

  validate (buyer, cb) {
    if (this.destroyed) return process.nextTick(cb, new Error('Seller is shutting down'))
    const tail = this._get(buyer)

    const timeout = setTimeout(ontimeout, 20000)
    let timedout = false
    if (tail.synced || tail.active()) return process.nextTick(onsynced)

    tail.once('synced', onsynced)
    tail.once('close', onsynced)
    tail.on('update', onupdate)

    function ontimeout () {
      timedout = true
      onsynced()
    }

    function onupdate () {
      if (tail.active()) onsynced()
    }

    function onsynced () {
      tail.removeListener('synced', onsynced)
      tail.removeListener('close', onsynced)
      tail.removeListener('update', onupdate)
      clearTimeout(timeout)

      const time = tail.remainingTime()
      if (time <= 0) return cb(new Error('No time left on subscription' + (timedout ? ' after timeout' : '')))

      cb(null, {
        type: 'time',
        remaining: time
      })
    }
  }

  buyers (privateKey, cb = privateKey) {
    if (typeof privateKey === 'function') privateKey = null
    if (typeof privateKey === 'string') privateKey = Buffer.from(privateKey, 'hex')

    const tweak = new DazaarETHTweak({
      secretKey: privateKey,
      publicKey: this.publicKey,
      chainId: CHAIN_IDS[this.payment.chain || 'mainnet']
    })

    this.seller.buyers((err, buyers) => {
      if (err) return cb(err)

      const res = []

      for (const { buyer, uniqueFeed } of buyers) {
        const { publicKey, secretKey, address } = privateKey ? tweak.keyPair(this.dazaar, buyer) : tweak.publicData(this.dazaar, buyer)
        res.push({ buyer, uniqueFeed, eth: { publicKey, secretKey: secretKey || null, address: address.toLowerCase() } })
      }

      cb(null, res)
    })
  }

  _filter (buyer) {
    return this.tweak.address(this.dazaar, buyer).toLowerCase()
  }

  _get (buyer) {
    const h = buyer.toString('hex')
    if (this.subscribers.has(h)) return this.subscribers.get(h)
    if (this.subscribers.size >= MAX_SUBSCRIBER_CACHE) this._gc()

    const self = this
    const tail = this.eth.subscription(this._filter(buyer), this.payment)
    this.subscribers.set(h, tail)

    tail.on('error', () => tail.destroy())
    tail.on('close', onclose)

    return tail

    function onclose () {
      if (self.subscribers.get(h) === tail) self.subscribers.delete(h)
    }
  }

  static supports (payment) {
    return !!payment.method && payment.method.toUpperCase() === 'ETH'
  }

  static publicKeyToBuffer (key) {
    if (typeof key === 'string' && key.startsWith('0x')) key = key.slice(2)
    if (typeof key === 'string') key = Buffer.from(key, 'hex')

    if (key.length === 64) {
      key = Buffer.concat([Buffer.from([0x04]), key])
    }

    return key
  }

  static validatePublicKey (key) {
    return DazaarETHTweak.validatePublicKey(this.publicKeyToBuffer(key))
  }

  static tweak (buyerKey, dazaarCard, payment = 0) {
    const payments = [].concat(dazaarCard.payment || [])

    if (typeof payment === 'number') payment = payments.filter(p => this.supports(p))[payment]
    if (typeof payment === 'string') payment = payments.find(p => this.supports(p) && p.currency && p.currency.toLowerCase() === payment.toLowerCase())

    if (!payment) throw new Error('Unknown payment')
    if (!pubKey(payment)) throw new Error('Payment does not support ETH')

    const t = new DazaarETHTweak({
      publicKey: Buffer.from(this.publicKeyToBuffer(pubKey(payment)), 'hex'),
      chainId: CHAIN_IDS[payment.chain || 'mainnet']
    })

    return t.address(dazaarCard.id, buyerKey).toLowerCase()
  }
}

function pubKey (payment) {
  return payment.payToPubKey || payment.payToPublicKey || payment.pubKey
}
