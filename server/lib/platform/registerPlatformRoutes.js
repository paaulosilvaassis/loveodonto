/**
 * Phase 4.10 Wave 3I — registro de rotas Platform/Console.
 */

export function registerPlatformRoutes(app, handlers) {
  const {
    requireConsoleAccess,
    handleConsoleProfile,
    handleProvisionUser,
    handleResetConsoleAdmin,
    handleTenantProvision,
    handleResendAccess,
    handleBillingOverview,
    handleTenantBilling,
    handleMarkInvoicePaid,
    handleBlockForBilling,
    handleUnblock,
    handleUpdateDueDate,
    handleUpdatePlan,
    handleApplyDiscount,
    handleEvaluateBilling,
    handleOnboardingTerms,
    handleAcceptTerms,
  } = handlers;

  app.get('/internal/platform/console-profile', handleConsoleProfile);
  app.post('/internal/platform/provision-user', requireConsoleAccess, handleProvisionUser);
  app.post('/internal/platform/dev/reset-console-admin', handleResetConsoleAdmin);
  app.post('/internal/platform/tenants/provision', requireConsoleAccess, handleTenantProvision);
  app.post('/internal/platform/tenants/:tenantId/resend-access', requireConsoleAccess, handleResendAccess);

  app.get('/internal/platform/billing/overview', requireConsoleAccess, handleBillingOverview);
  app.get('/internal/platform/tenants/:tenantId/billing', requireConsoleAccess, handleTenantBilling);
  app.post('/internal/platform/tenants/:tenantId/invoices/:invoiceId/mark-paid', requireConsoleAccess, handleMarkInvoicePaid);
  app.post('/internal/platform/tenants/:tenantId/block-for-billing', requireConsoleAccess, handleBlockForBilling);
  app.post('/internal/platform/tenants/:tenantId/unblock', requireConsoleAccess, handleUnblock);
  app.patch('/internal/platform/tenants/:tenantId/invoices/:invoiceId/due-date', requireConsoleAccess, handleUpdateDueDate);
  app.patch('/internal/platform/tenants/:tenantId/subscription/plan', requireConsoleAccess, handleUpdatePlan);
  app.post('/internal/platform/tenants/:tenantId/invoices/:invoiceId/discount', requireConsoleAccess, handleApplyDiscount);
  app.post('/internal/platform/billing/evaluate', requireConsoleAccess, handleEvaluateBilling);

  app.get('/public/platform/onboarding/terms', handleOnboardingTerms);
  app.post('/public/platform/onboarding/accept-terms', handleAcceptTerms);
}
