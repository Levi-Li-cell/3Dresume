/**
 * Provider-neutral paid-order settlement. Kept free of HTTP/Supabase details so
 * the same authorization rules can be exercised by the payment smoke test.
 */
export async function settleWechatPayment(repository, payment, paidAt) {
  const orderId = String(payment?.out_trade_no || '')
  const transactionId = String(payment?.transaction_id || '')
  if (!orderId || !transactionId) return { accepted: false, reason: 'invalid_payload' }

  const order = await repository.findOrder(orderId)
  if (!order || Number(payment?.amount?.total) !== Number(order.amount_fen)) return { accepted: false, reason: 'order_validation_failed' }

  await repository.markPaid(order.id, transactionId, paidAt)
  await repository.grantLicense(order.user_id, order.id, paidAt)
  return { accepted: true, orderId }
}
