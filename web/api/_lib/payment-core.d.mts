export type WechatPayment = {
  out_trade_no?: string
  transaction_id?: string
  amount?: { total?: number }
}

export type PaymentRepository = {
  findOrder: (orderId: string) => Promise<{ id: string; user_id: string; amount_fen: number } | null>
  markPaid: (orderId: string, transactionId: string, paidAt: string) => Promise<void>
  grantLicense: (userId: string, orderId: string, paidAt: string) => Promise<void>
}

export function settleWechatPayment(repository: PaymentRepository, payment: WechatPayment, paidAt: string): Promise<{ accepted: true; orderId: string } | { accepted: false; reason: 'invalid_payload' | 'order_validation_failed' }>
