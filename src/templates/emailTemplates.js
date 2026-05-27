const formatCurrency = (amount) => {
  const numericAmount = Number(amount) || 0;
  return numericAmount.toFixed(2);
};

const getCustomerName = (order) => {
  const firstName = order?.customer?.firstName || "";
  const lastName = order?.customer?.lastName || "";
  return `${firstName} ${lastName}`.trim() || "Customer";
};

const getOrderSummaryText = (order) => {
  return [
    `Order Number: ${order?.orderNumber || "N/A"}`,
    `Customer: ${getCustomerName(order)}`,
    `Email: ${order?.customer?.email || "N/A"}`,
    `Order Total: ${formatCurrency(order?.totalAmount)}`,
    `Payment Status: ${order?.paymentStatus || "N/A"}`,
    `Order Status: ${order?.orderStatus || "N/A"}`
  ].join("\n");
};

const getOrderSummaryHtml = (order) => {
  return `
    <p><strong>Order Number:</strong> ${order?.orderNumber || "N/A"}</p>
    <p><strong>Customer:</strong> ${getCustomerName(order)}</p>
    <p><strong>Email:</strong> ${order?.customer?.email || "N/A"}</p>
    <p><strong>Order Total:</strong> ${formatCurrency(order?.totalAmount)}</p>
    <p><strong>Payment Status:</strong> ${order?.paymentStatus || "N/A"}</p>
    <p><strong>Order Status:</strong> ${order?.orderStatus || "N/A"}</p>
  `;
};

const orderConfirmationTemplate = (order) => {
  const subject = `Order Confirmation - ${order?.orderNumber || "Order"}`;
  const text = `Thank you for your order.\n\n${getOrderSummaryText(order)}`;
  const html = `
    <h2>Thank you for your order</h2>
    ${getOrderSummaryHtml(order)}
    <p>We will notify you once your order is processed.</p>
  `;

  return { subject, html, text };
};

const adminNewOrderTemplate = (order) => {
  const subject = `New Order Received - ${order?.orderNumber || "Order"}`;
  const text = `A new order has been placed.\n\n${getOrderSummaryText(order)}`;
  const html = `
    <h2>New Order Notification</h2>
    ${getOrderSummaryHtml(order)}
    <p>Please review and process this order.</p>
  `;

  return { subject, html, text };
};

const paymentStatusUpdateTemplate = (order) => {
  const subject = `Payment Status Updated - ${order?.orderNumber || "Order"}`;
  const text = `Your payment status has been updated.\n\n${getOrderSummaryText(order)}`;
  const html = `
    <h2>Payment Status Updated</h2>
    ${getOrderSummaryHtml(order)}
    <p>Your payment status has been updated successfully.</p>
  `;

  return { subject, html, text };
};

const orderStatusUpdateTemplate = (order) => {
  const subject = `Order Status Updated - ${order?.orderNumber || "Order"}`;
  const text = `Your order status has been updated.\n\n${getOrderSummaryText(order)}`;
  const html = `
    <h2>Order Status Updated</h2>
    ${getOrderSummaryHtml(order)}
    <p>Your order status has been updated successfully.</p>
  `;

  return { subject, html, text };
};

module.exports = {
  orderConfirmationTemplate,
  adminNewOrderTemplate,
  paymentStatusUpdateTemplate,
  orderStatusUpdateTemplate
};
