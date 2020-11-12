const clerk = require('payment-tracker/bigint')
const units = require('eth-helpers/units')
const { EventEmitter } = require('events')

module.exports = function configure (index, client) {
  if (!client) client = index

  return {
    subscription
  }

  // include 2000ms payment delay to account for block latency
  function subscription (buyer, paymentInfo, minSeconds, paymentDelay) {
    let perSecond = 0

    if (typeof paymentInfo === 'object' && paymentInfo) { // dazaar card
      perSecond = convertDazaarPayment(paymentInfo)
      minSeconds = paymentInfo.minSeconds
      paymentDelay = paymentInfo.paymentDelay
    } else {
      const match = paymentInfo.trim().match(/^(\d(?:\.\d+)?)\s*ETH\s*\/\s*s$/i)
      if (!match) throw new Error('rate should have the form "n....nn ETH/s"')
      perSecond = BigInt(match[1])
    }

    const sub = new EventEmitter()
    let stream = null
    let payments = clerk(perSecond, minSeconds, paymentDelay)

    client.add(buyer).then((a) => {
      stream = index.createTransactionStream(buyer)

      sub.synced = false
      stream.once('synced', function () {
        sub.synced = true
        sub.emit('synced')
      })

      stream.on('data', async function (data) {
        if (data.timestamp) {
          const amount = BigInt(data.value)
          const time = BigInt(data.timestamp * 1000) // ETH timestamps are in seconds
          payments.add({ amount, time })
        } else {
          const tx = data.value
          const block = await index.db.get(blockKey(tx.blockNumber))

          const amount = BigInt(tx.value)
          const time = BigInt(block.value.timestamp * 1000) // ETH timestamps are in seconds
          payments.add({ amount, time })
        }

        sub.emit('update')
      })
    })

    sub.active = payments.active
    sub.remainingTime = payments.remainingTime
    sub.remainingFunds = payments.remainingFunds

    sub.destroy = function () {
      payments = null
      if (stream) stream.destroy()
    }

    return sub
  }
}

function convertDazaarPayment (pay) {
  let ratio = 0n

  switch (pay.unit) {
    case 'minutes':
      ratio = 60n
      break
    case 'seconds':
      ratio = 1n
      break
    case 'hours':
      ratio = 3600n
      break
  }

  const perSecond = BigInt(pay.amount) / (BigInt(pay.interval) * ratio)
  if (!perSecond) throw new Error('Invalid payment info')

  return units.convert(perSecond, units[pay.currency])
}

function blockKey (seq) {
  return '!block!' + padBlockNumber(seq)
}

function padBlockNumber (n) {
  return n.slice(2).padStart(12, '0')
}
