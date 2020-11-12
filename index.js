const Indexer = require('../../eth/eth-transaction-indexer')
const Hyperbee = require('hyperbee')
const hypercore = require('hypercore')
const replicate = require('@hyperswarm/replicator')
const payments = require('./subscription')
const DazaarETHTweak = require('@dazaar/eth-tweak')

const MAX_SUBSCRIBER_CACHE = 500

module.exports = class DazaarETHPayment {
  constructor (dazaar, feedKey, ethPubkey, payment, opts = {}) {
    this.dazaar = dazaar.key
    this.payment = payment
    this.feed = hypercore('./db', feedKey)

    this.index = new Indexer(this.feed)
    this.client = opts.client
    replicate(this.feed, { lookup: true, announce: false, live: true, download: true })

    this.subscribers = new Map()
    this.eth = payments(this.index, this.client)

    this.tweak = new DazaarETHTweak({
      publicKey: ethPubkey,
      chainId: opts.chainId
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
    console.log('pay to: ' + this.tweak.address(this.dazaar, buyer))
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
}

function metadata (seller, buyer) {
  return 'dazaar: ' + seller.toString('hex') + ' ' + buyer.toString('hex')
}
