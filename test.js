const payment = require('./')
console.log(payment)

const to = '0x50c7d91e74b0e42bd8bce8ad6d199e4a23c0b193'

const dazaar = {
  key: Buffer.alloc(32, 1)
}

const paymentCard = {
  payto: 'dazaartest22',
  currency: 'microether',
  amount: '1',
  unit: 'seconds',
  interval: 1
}

const pubkey = Buffer.from('04211d1ba75165897653e5b74de523d7f42b46e4ce730d371497b01ef5af4466f9f8439cc7f061ffa26a79a3578f0db884b649f12cf255f27e400bc27b5d3625ea', 'hex')

const test = new payment(dazaar, null, pubkey, paymentCard)
console.log(test._get(to))

test.validate(to, console.log)
