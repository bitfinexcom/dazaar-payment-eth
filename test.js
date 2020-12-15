const Payment = require('./')
const Index = require('@hyperdivision/eth-transaction-indexer')
const hypercore = require('hypercore')

const pubKey = Buffer.from('0380429c32de58087251993924d44727ef4ffe1f427ceca917f91bdcc015abc6aa', 'hex')

const paymentCard = {
  method: 'ETH',
  currency: 'WEENUS',
  payToPubKey: pubKey.toString('hex'),
  erc20Contract: '0x101848d5c5bbca18e6b4431eedf6b95e9adf82fa',
  erc20ContractDecimals: '18',
  chain: 'ropsten',
  amount: 0.01,
  unit: 'seconds',
  interval: 1
}

const dazaar = {
  key: Buffer.alloc(32, 4)
}

const dazaarCard = {
  id: dazaar.key.toString('hex'),
  payment: [paymentCard]
}

const url = 'https://ropsten.infura.io/v3/2aa3f1f44c224eff83b07cef6a5b48b5'
const index = new Index(hypercore('./db'), { endpoint: url, confirmations: 0 })
const test = new Payment(dazaar, paymentCard, index)
const to = Buffer.alloc(32, 5)

console.log(to)
console.log(Payment.tweak(to, dazaarCard, 0))

test.validate(to, (err, info) => {
  console.log(err, info)
  setInterval(() => {
    test.validate(to, console.log)
  }, 5000)
})
