Role permission matrix (summary)

Core principle

- Super Admin is a platform provisioning and oversight role (multi-business scope). It must NOT be allowed to post transactions or perform day-to-day financial operations to preserve segregation of duties (SoD).

Canonical roles and high-level permissions

- Super Admin
  - Permissions: dashboard (view), reports (view), admin (backup/subscription/audit view), settings
  - Scope: all businesses
  - Notes: Can create user accounts and assign roles (provisioning). Cannot post transactions or run daily closing.

- Super Admin (company owner)
  - Permissions: dashboard, sales, inventory, customers, suppliers, accounting, reports, settings (business-level)
  - Scope: their business (optionally multi-business when applicable)

- Accountant / Finance Manager
  - Permissions: dashboard, accounting (GL, daily close, receivables, payables, prepayments, supplier rebates, loans), reports
  - Scope: business

- Sales Officer / Cashier
  - Permissions: dashboard, sales
  - Scope: own/team

- Procurement / Purchasing Officer
  - Permissions: payables, supplier management, inventory (view)
  - Scope: own/team

- Inventory / Stock Manager
  - Permissions: inventory, product-manager
  - Scope: business

- HR Officer
  - Permissions: staff-management (HR functions only)
  - Scope: business
  - Notes: Separate from Super Admin `staff-create`/`assign-role` capability.

- Auditor (Internal/External)
  - Permissions: dashboard (view), reports (view), audit/admin (view-only)
  - Scope: all
  - Notes: View-only access across finance and audit trails.

- Bank / Treasury Officer
  - Permissions: bank transactions, bank balances
  - Scope: business

Design notes and next steps

- Split `staff-management` into two permission facets: `staff-provision` (create logins, assign roles) and `staff-hr` (manage HR records). Super Admin gets `staff-provision`, HR Officer gets `staff-hr`.
- Consider maker-checker (approval) workflows for Sales and high-value payments.
- Ensure `roleHasPermission` uses the role's explicit permission set (no unconditional bypass for platform roles).

Files changed

- Updated: `lib/rbac.ts`, `lib/rbac.mjs`, `lib/rbac.js` to restrict `super-admin` permissions and remove automatic bypass.
- Updated: `tests/rbac.test.mjs` to reflect Super Admin as provisioning/oversight role.

If you want, I can:
- Add more granular permission keys (e.g., `staff-provision`, `staff-hr`, `banking`, `daily-close`) and wire them through routes and UI.
- Update the role-management UI to expose the new granular permissions.
