import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';

import { api, getStoredUser, getToken, clearSession, setUnauthorizedHandler, TOKEN_KEY, USER_KEY } from './api';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import Toast from './components/Toast';

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('loading'); // loading | login | register | dashboard
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [summary, setSummary] = useState({ total_cost: 0, vehicle_count: 0 });
  const [toast, setToast] = useState({ message: '', tone: 'error' });
  const [authNotice, setAuthNotice] = useState('');

  const notify = useCallback((message, tone = 'error') => setToast({ message, tone }), []);
  const dismissToast = useCallback(() => setToast({ message: '', tone: 'error' }), []);

  // Derive the selected vehicle from the list rather than storing a copy, so it
  // can never drift out of sync with freshly fetched data.
  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
    setVehicles([]);
    setSelectedVehicleId(null);
    setHistory([]);
    setSummary({ total_cost: 0, vehicle_count: 0 });
    setView('login');
  }, []);

  // Any 401 anywhere in the app ends the session and returns to login, instead
  // of leaving the user on an empty dashboard that silently fails forever.
  useEffect(() => {
    setUnauthorizedHandler((message) => {
      signOut();
      setAuthNotice(message || 'Your session expired. Please sign in again.');
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser && getToken()) {
      setUser(storedUser);
      setView('dashboard');
    } else {
      clearSession();
      setView('login');
    }
  }, []);

  const refreshGarage = useCallback(async () => {
    try {
      const [vehicleList, summaryData] = await Promise.all([api.listVehicles(), api.summary()]);
      setVehicles(vehicleList);
      setSummary(summaryData);
      return vehicleList;
    } catch (err) {
      if (err.name !== 'AuthError') notify(err.message);
      return [];
    }
  }, [notify]);

  const loadHistory = useCallback(async (vehicleId) => {
    if (!vehicleId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      setHistory(await api.listRecords(vehicleId));
    } catch (err) {
      setHistory([]);
      if (err.name !== 'AuthError') notify(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (user) refreshGarage();
  }, [user, refreshGarage]);

  useEffect(() => {
    loadHistory(selectedVehicleId);
  }, [selectedVehicleId, loadHistory]);

  // --- auth ------------------------------------------------------------------

  const handleLogin = async (credentials) => {
    try {
      const res = await api.login(credentials);
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      setUser(res.user);
      setAuthNotice('');
      setView('dashboard');
    } catch (err) {
      setAuthNotice(err.message);
    }
  };

  const handleRegister = async (credentials) => {
    try {
      await api.register(credentials);
      setView('login');
      setAuthNotice('Account created. Please sign in.');
    } catch (err) {
      setAuthNotice(err.message);
    }
  };

  // --- vehicles --------------------------------------------------------------

  const createVehicle = async (form) => {
    try {
      const created = await api.createVehicle(form);
      await refreshGarage();
      notify(`${created.year} ${created.make} ${created.model} added.`, 'success');
    } catch (err) {
      if (err.name !== 'AuthError') notify(err.message);
      throw err; // let the form keep the user's input on failure
    }
  };

  const updateVehicle = async (id, changes) => {
    try {
      await api.updateVehicle(id, changes);
      await refreshGarage();
      notify('Vehicle updated.', 'success');
    } catch (err) {
      if (err.name !== 'AuthError') notify(err.message);
      throw err;
    }
  };

  const deleteVehicle = async (vehicle) => {
    const label = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    if (!window.confirm(`Delete ${label} and all of its service records?`)) return;
    try {
      await api.deleteVehicle(vehicle.id);
      if (selectedVehicleId === vehicle.id) setSelectedVehicleId(null);
      await refreshGarage();
      notify(`${label} deleted.`, 'success');
    } catch (err) {
      if (err.name !== 'AuthError') notify(err.message);
    }
  };

  // --- records ---------------------------------------------------------------

  const createRecord = async (form) => {
    try {
      await api.createRecord(form);
      // Re-read both instead of guessing the new odometer locally: the server
      // keeps the highest mileage, so a backdated record must not lower it.
      await Promise.all([refreshGarage(), loadHistory(form.vehicle_id)]);
      notify('Service record saved.', 'success');
    } catch (err) {
      if (err.name !== 'AuthError') notify(err.message);
      throw err;
    }
  };

  const updateRecord = async (id, changes) => {
    try {
      await api.updateRecord(id, changes);
      await Promise.all([refreshGarage(), loadHistory(selectedVehicleId)]);
      notify('Record updated.', 'success');
    } catch (err) {
      if (err.name !== 'AuthError') notify(err.message);
      throw err;
    }
  };

  const deleteRecord = async (record) => {
    // Deleting a record used to happen with no confirmation at all, unlike vehicles.
    if (!window.confirm(`Delete the "${record.task}" record?`)) return;
    try {
      await api.deleteRecord(record.id);
      await Promise.all([refreshGarage(), loadHistory(selectedVehicleId)]);
      notify('Record deleted.', 'success');
    } catch (err) {
      if (err.name !== 'AuthError') notify(err.message);
    }
  };

  // --- render ----------------------------------------------------------------

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-cyan-400 mx-auto mb-4" />
          <p className="text-lg font-bold text-white">Loading CarKeeper...</p>
        </div>
      </div>
    );
  }

  if (view === 'login' || view === 'register') {
    return (
      <AuthScreen
        mode={view}
        onModeChange={(next) => {
          setView(next);
          setAuthNotice('');
        }}
        onLogin={handleLogin}
        onRegister={handleRegister}
        notice={authNotice}
      />
    );
  }

  return (
    <>
      <Dashboard
        vehicles={vehicles}
        summary={summary}
        selectedVehicle={selectedVehicle}
        history={history}
        historyLoading={historyLoading}
        onSelectVehicle={(vehicle) => setSelectedVehicleId(vehicle.id)}
        onCreateVehicle={createVehicle}
        onUpdateVehicle={updateVehicle}
        onDeleteVehicle={deleteVehicle}
        onCreateRecord={createRecord}
        onUpdateRecord={updateRecord}
        onDeleteRecord={deleteRecord}
        onSignOut={signOut}
        onNotify={notify}
      />
      <Toast message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
    </>
  );
};

export default App;
