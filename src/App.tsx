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

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/account" element={<AccountSettings />} />
            <Route path="/guest" element={<GuestStudio />} />
            <Route path="login" element={<Login />} />
            <Route path="signup" element={<Signup />} />
            <Route path="member/studio" element={<MemberStudio />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
