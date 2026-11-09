import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { RequireAuth, RequireRole } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { AiPage } from "@/pages/ai";
import { SettingsPage } from "@/pages/settings";
import { ProductsPage } from "@/pages/products";
import { WarehousesPage } from "@/pages/warehouses";
import { PartnersPage } from "@/pages/partners";
import { InventoryPage } from "@/pages/inventory";
import { InventoryLedgerPage } from "@/pages/inventory-ledger";
import { StocktakesPage } from "@/pages/stocktakes";
import { StocktakeDetailPage } from "@/pages/stocktake-detail";
import { ReportsPage } from "@/pages/reports";
import { UsersPage } from "@/pages/users";
import { AuditLogsPage } from "@/pages/audit-logs";
import { SystemInfoPage } from "@/pages/system-info";
import { NotFoundPage } from "@/pages/not-found";
import { OrderListPage } from "@/pages/orders/order-list";
import { OrderFormPage } from "@/pages/orders/order-form";
import { OrderDetailPage } from "@/pages/orders/order-detail";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route
                path="ai"
                element={
                  <RequireRole roles={["ADMIN", "MANAGER", "OPERATOR"]}>
                    <AiPage />
                  </RequireRole>
                }
              />

              <Route path="products" element={<ProductsPage />} />
              <Route path="warehouses" element={<WarehousesPage />} />
              <Route path="suppliers" element={<PartnersPage kind="supplier" />} />
              <Route path="customers" element={<PartnersPage kind="customer" />} />

              <Route path="inventory" element={<InventoryPage />} />
              <Route path="inventory/ledger" element={<InventoryLedgerPage />} />

              <Route path="inbound-orders" element={<OrderListPage type="inbound" />} />
              <Route path="inbound-orders/new" element={<OrderFormPage type="inbound" />} />
              <Route path="inbound-orders/:id" element={<OrderDetailPage type="inbound" />} />
              <Route path="inbound-orders/:id/edit" element={<OrderFormPage type="inbound" />} />

              <Route path="outbound-orders" element={<OrderListPage type="outbound" />} />
              <Route path="outbound-orders/new" element={<OrderFormPage type="outbound" />} />
              <Route path="outbound-orders/:id" element={<OrderDetailPage type="outbound" />} />
              <Route path="outbound-orders/:id/edit" element={<OrderFormPage type="outbound" />} />

              <Route path="transfer-orders" element={<OrderListPage type="transfer" />} />
              <Route path="transfer-orders/new" element={<OrderFormPage type="transfer" />} />
              <Route path="transfer-orders/:id" element={<OrderDetailPage type="transfer" />} />
              <Route path="transfer-orders/:id/edit" element={<OrderFormPage type="transfer" />} />

              <Route path="stocktakes" element={<StocktakesPage />} />
              <Route path="stocktakes/:id" element={<StocktakeDetailPage />} />

              <Route path="reports" element={<ReportsPage />} />

              <Route
                path="system/users"
                element={
                  <RequireRole roles={["ADMIN"]}>
                    <UsersPage />
                  </RequireRole>
                }
              />
              <Route
                path="system/audit-logs"
                element={
                  <RequireRole roles={["ADMIN", "MANAGER"]}>
                    <AuditLogsPage />
                  </RequireRole>
                }
              />
              <Route
                path="system/settings"
                element={
                  <RequireRole roles={["ADMIN"]}>
                    <SettingsPage />
                  </RequireRole>
                }
              />
              <Route path="system/info" element={<SystemInfoPage />} />

              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
          <Route path="*" element={<LoginPage />} />
        </Routes>
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{ style: { fontFamily: "inherit" } }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
