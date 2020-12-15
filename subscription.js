const clerk = require('payment-tracker/bigint')
const units = require('eth-helpers/units')
const { EventEmitter } = require('events')

module.exports = function configure (index) {
  return {
    subscription
  }

  // include 2000ms payment delay to account for block latency
  function subscription (buyer, paymentInfo, minSeconds, paymentDelay) {
    let perSecond = 0
    let token = null

    if (typeof paymentInfo === 'object' && paymentInfo) { // dazaar card
      token = paymentInfo.erc20Contract
      perSecond = convertDazaarPayment(paymentInfo, Number(token ? paymentInfo.erc20ContractDecimals : '18') || 0, token)
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

    index.add(buyer, { token }).then((a) => {
      if (!payments) return

      stream = index.createTransactionStream(buyer, { live: true })

      sub.synced = false
      stream.once('synced', function () {
        sub.synced = true
        sub.emit('synced')
      })

      stream.on('data', function (data) {
        const amount = BigInt(data.value)
        const time = data.timestamp * 1000 // ETH timestamps are in seconds
        payments.add({ amount, time })
        sub.emit('update')
      })
    }, () => {
      // do nothing
    })

    sub.active = payments.active
    sub.remainingTime = () => payments.remainingTime()
    sub.remainingFunds = payments.remainingFunds

    sub.destroy = function () {
      payments = null
      if (stream) stream.destroy()
    }

    return sub
  }
}

function convertDazaarPayment (pay, decimals, token) {
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

  let factor = 1

  let amount = Number(pay.amount)
  while ((amount | 0) !== amount && amount > 0) {
    amount *= 10
    factor *= 10
  }

  amount = BigInt(amount)
  factor = BigInt(factor)

  if (token) {
    for (let i = 0; i < decimals; i++) {
      amount *= 10n
    }
  }

  const perSecond = amount / (BigInt(pay.interval) * ratio) / factor
  if (!perSecond) throw new Error('Invalid payment info')

  if (token) return perSecond

  return units.convert(perSecond, units[pay.currency || pay.method])
}
