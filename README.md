# @dazaar/payment-eth
Ethereum payment api for Dazaar stream services

## Usage

```js
const PaymentETH = require('@dazaar/payment-eth')
const market = require('dazaar/market')
const Index = require('@hyperdivision/eth-transaction-indexer')
const hypercore = require('hypercore')

const index = new Index(hypercore('./tmp/db'), {
  endpoint: 'https://infura...'
})

const m = market('./tmp')
const feed = hypercore('./tmp/data')

const paymentCard = {
  id: 'dazaartest22',
  payment: [{
    method: 'ETH',
    pubKey: '0x50c7d91e74b0e42bd8bce8ad6d199e4a23c0b193',
    currency: 'microether',
    amount: 1,
    unit: 'seconds',
    interval: 1
  }]
}

let payment

// instantiate a seller for a feed and equip it
// with a validate function
const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    payee.validate(remoteKey, cb)
  }
})

seller.ready(function (err) {
  // payment now set up. dazaar logic follows ...
  payment = new PaymentETH(seller, paymentCard, index)
})
```

### Buyer
```js
// instantiate a buyer for a specific feed
const buyer = m.buy(seller.key)

// generate the ethereum adress to pay to for a given stream
const payTo = PaymentETH.tweak(buyer.key, dazaarCard, 'microether')

// pay the desired amount to the address generated
```

## API
#### `const payment = PaymentETH(seller, payment, index)`

Create a new eth payment instance associated to a seller. `seller` should be a dazaar seller instance, `payment` may either be a dazaar payment card, or a string specifying the per second rate in either `ETH`, such as `0.0002 ETH/s`. `index` should be a [transaction indexer](https://github.com/hyperdivision/eth-transaction-indexer)

#### `payment.validate(buyerKey, cb)`

A seller can validate the time left for a given buyer. Returns `error` if there is no time left on the subscription. The method shall check whether the given buyer has a subscription set-up and instantiate one not already present.

#### `const payTo = PaymentETH.tweak(buyerKey, dazaarCard, [paymentType])`

Static method to generate the ETH address to pay to for a given stream. `buyerKey` is the buyer's dazaar key and `dazaarCard` give the relevant stream details.

## License
MIT
