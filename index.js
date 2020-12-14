const Indexer = require('@hyperdivsion/eth-transaction-indexer')
const hypercore = require('hypercore')
const replicate = require('@hyperswarm/replicator')
const payments = require('./subscription')
const DazaarETHTweak = require('@dazaar/eth-tweak')

const MAX_SUBSCRIBER_CACHE = 500
const CHAIN_IDS = {
  mainnet: 1,
  ropsten: 3,
  rinkeby: 4,
  kovan: 42,
  classic: 61
}

module.exports = class DazaarETHPayment {
  constructor (dazaar, payment, opts = {}) {
    this.dazaar = dazaar.key
    this.payment = payment

    this._storage = opts.storage || './db'
    this.feed = opts.index ? opts.index.feed : hypercore(this._storage, opts.feedKey)

    this.index = opts.index || new Indexer(this.feed, opts)
    this.client = this.index.live ? null : opts.client

    if (opts.client === undefined) {
      throw new Error('Indexer must have access to the network.')
    }

    replicate(this.feed, { lookup: true, announce: false, live: true, download: true })

    this.subscribers = new Map()
    this.eth = payments(this.index, this.client)

    this.tweak = new DazaarETHTweak({
      publicKey: payment.pubKey,
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

  _filter (buyer) {
    return this.tweak.address(this.dazaar, buyer)
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

  static tweak (buyerKey, dazaarCard, payment = 0) {
    if (typeof payment === 'number') payment = dazaarCard.payment[payment]
    if (typeof payment === 'string') payment = dazaarCard.payment.find(p => p.method.toLowerCase() === payment.toLowerCase())

    if (!payment) throw new Error('Unknown payment')
    if (!payment.pubKey) throw new Error('Payment does not support ETH')
 
    const t = new DazaarETHTweak({
      publicKey: payment.pubKey,
      chainId: CHAIN_IDS[payment.chain || 'mainnet']
    })

    return t.address(dazaarCard.id, buyer)
  }
}
