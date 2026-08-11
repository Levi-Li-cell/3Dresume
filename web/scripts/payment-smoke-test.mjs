import assert from 'node:assert/strict'
import test from 'node:test'
import { settleWechatPayment } from '../api/_lib/payment-core.mjs'

function fakeRepository() {
  const orders = new Map([['sen_smoke_order', { id: 'sen_smoke_order', user_id: 'smoke-user', amount_fen: 300, status: 'pending' }]])
  const licenses = new Map()
  return {
    orders,
    licenses,
    findOrder: async (id) => orders.get(id) || null,
    markPaid: async (id, transactionId, paidAt) => {
      const order = orders.get(id)
      if (order.status !== 'paid') orders.set(id, { ...order, status: 'paid', transaction_id: transactionId, paid_at: paidAt })
    },
    grantLicense: async (userId, orderId, paidAt) => licenses.set(`${userId}:sen-3d-editor`, { userId, orderId, paidAt, status: 'active' }),
  }
}

const paidCallback = { out_trade_no: 'sen_smoke_order', transaction_id: 'wechat-smoke-transaction', amount: { total: 300 } }

test('支付回调成功后，订单变为 paid 并授予编辑权限', async () => {
  const repository = fakeRepository()
  const result = await settleWechatPayment(repository, paidCallback, '2026-08-11T00:00:00.000Z')
  assert.deepEqual(result, { accepted: true, orderId: 'sen_smoke_order' })
  assert.equal(repository.orders.get('sen_smoke_order').status, 'paid')
  assert.equal(repository.licenses.get('smoke-user:sen-3d-editor').status, 'active')
})

test('微信重复通知不会创建第二份授权', async () => {
  const repository = fakeRepository()
  await settleWechatPayment(repository, paidCallback, '2026-08-11T00:00:00.000Z')
  await settleWechatPayment(repository, paidCallback, '2026-08-11T00:00:05.000Z')
  assert.equal(repository.licenses.size, 1)
  assert.equal(repository.orders.get('sen_smoke_order').transaction_id, 'wechat-smoke-transaction')
})

test('金额不匹配时拒绝授权', async () => {
  const repository = fakeRepository()
  const result = await settleWechatPayment(repository, { ...paidCallback, amount: { total: 1 } }, '2026-08-11T00:00:00.000Z')
  assert.deepEqual(result, { accepted: false, reason: 'order_validation_failed' })
  assert.equal(repository.orders.get('sen_smoke_order').status, 'pending')
  assert.equal(repository.licenses.size, 0)
})
