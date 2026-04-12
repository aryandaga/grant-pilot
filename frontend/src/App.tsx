import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Investors from './pages/Investors';
import InvestorDetail from './pages/InvestorDetail';
import Documents from './pages/Documents';

function App() {
  const isAuthenticated = !!localStorage.getItem('token');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/investors"
          element={isAuthenticated ? <Investors /> : <Navigate to="/login" />}
        />
        <Route
          path="/investor/:id"
          element={isAuthenticated ? <InvestorDetail /> : <Navigate to="/login" />}
        />
        <Route
          path="/documents"
          element={isAuthenticated ? <Documents /> : <Navigate to="/login" />}
        />

        <Route
          path="*"
          element={
            isAuthenticated
              ? <Navigate to="/investors" replace />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;