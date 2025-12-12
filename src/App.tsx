import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Home } from "./pages/Home";
import { Pricing } from "./pages/Pricing";
import { AccountSettings } from "./pages/AccountSettings";
import { GuestStudio } from "./pages/GuestStudio";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { MemberStudio } from "./pages/MemberStudio";
import { AuthProvider } from "./context/AuthContext";
// Admin pages
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminUsersList } from "./pages/admin/AdminUsersList";
import { AdminUserDetail } from "./pages/admin/AdminUserDetail";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public/Member Routes */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/account" element={<AccountSettings />} />
            <Route path="/guest" element={<GuestStudio />} />
            <Route path="login" element={<Login />} />
            <Route path="signup" element={<Signup />} />
            <Route path="member/studio" element={<MemberStudio />} />
          </Route>

          {/* Admin Routes - separate layout, protected */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsersList />} />
            <Route path="users/:uid" element={<AdminUserDetail />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
