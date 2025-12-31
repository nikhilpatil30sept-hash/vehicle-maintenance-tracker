import React, { useState, useEffect } from 'react';
import { 
  Car, Wrench, LogOut, LayoutDashboard, 
  ShieldCheck, Activity, Trash2, AlertTriangle, Calendar, 
  Loader2, CheckCircle2, Upload, Edit2, X, Save
} from 'lucide-react';

const App = () => {
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }, []);

  const [user, setUser] = useState(null);
  const [view, setView] = useState('loading');
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState({ total_cost: 0, vehicle_count: 0 });
  const [error, setError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedItems, setExtractedItems] = useState([]);
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  
  const [authData, setAuthData] = useState({ username: '', password: '' });
  const [vForm, setVForm] = useState({ make: '', model: '', year: '', license_plate: '', current_mileage: '' });
  const [rForm, setRForm] = useState({ date: new Date().toISOString().split('T')[0], task: '', cost: '', mileage: '', verification_hash: '' });

  const API_BASE = "https://my-flask-backend-3ehc.onrender.com";
  const apiKey = "AIzaSyBSw00TIh5566uPhPRJHzlxndmLy95NLxs";

  const request = async (method, path, body = null) => {
    const xhr = new XMLHttpRequest();
    return new Promise((resolve, reject) => {
      xhr.open(method, `${API_BASE}${path}`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = () => {
        let res = {};
        try { res = JSON.parse(xhr.responseText || "{}"); } catch(e) {}
        if (xhr.status < 300) {
          resolve(res);
        } else {
          reject(res.error || "Request failed");
        }
      };
      xhr.onerror = () => reject("Network error: Backend may be offline");
      xhr.send(body ? JSON.stringify(body) : null);
    });
  };

  const performOCR = async (base64Image) => {
    setIsAnalyzing(true);
    setError('');
    
    const systemPrompt = `You are analyzing a vehicle service receipt. Extract ALL service items and details.

Return a JSON array with this structure:
{
  "date": "YYYY-MM-DD format",
  "mileage": number (current odometer reading, often in notes section),
  "items": [
    {"task": "description", "cost": number},
    {"task": "description", "cost": number}
  ]
}

Rules:
- Extract EVERY line item charge separately (oil change, inspection, fees, etc)
- Find the odometer/mileage reading (may be in technician notes)
- Convert dates like "October 14, 2025" to "2025-10-14"
- Return ONLY valid JSON, no markdown, no explanations
- If multiple services exist, list them ALL in the items array`;

    const fetchWithRetry = async (retries = 0) => {
      try {
        if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
          throw new Error("API key not configured. Please add your Gemini API key to the code.");
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: systemPrompt },
                { inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] } }
              ]
            }],
            generationConfig: { 
              temperature: 0.1
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          if (retries < 3) {
            const delay = Math.pow(2, retries) * 1000;
            await new Promise(r => setTimeout(r, delay));
            return fetchWithRetry(retries + 1);
          }
          throw new Error(errorData.error?.message || "API request failed");
        }

        const result = await response.json();
        let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("No text returned from AI");
        
        const sanitizedJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const extracted = JSON.parse(sanitizedJson);
        
        if (extracted.items && extracted.items.length > 0) {
          setExtractedItems(extracted.items);
          setShowItemSelector(true);
          setRForm(prev => ({
            ...prev,
            date: extracted.date || prev.date,
            mileage: extracted.mileage || prev.mileage
          }));
          setError(`Found ${extracted.items.length} service items. Select one to add.`);
        } else {
          throw new Error("No service items found in receipt");
        }
      } catch (err) {
        if (retries >= 3) {
          setError(`AI Analysis failed: ${err.message}. Please enter manually.`);
        } else {
          const delay = Math.pow(2, retries) * 1000;
          await new Promise(r => setTimeout(r, delay));
          return fetchWithRetry(retries + 1);
        }
      } finally {
        setIsAnalyzing(false);
      }
    };

    fetchWithRetry();
  };

  const selectExtractedItem = (item) => {
    const verificationHash = `GUARDIAN-TRUST-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    setRForm(prev => ({
      ...prev,
      task: item.task,
      cost: item.cost.toString(),
      verification_hash: verificationHash
    }));
    setShowItemSelector(false);
    setExtractedItems([]);
    setError('');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => performOCR(reader.result);
    reader.onerror = () => setError('Failed to read image file');
    reader.readAsDataURL(file);
  };

  const fetchData = async () => {
    if (!user) return;
    try {
      const v = await request('GET', `/vehicles?user_id=${user.id}`);
      setVehicles(v);
      const s = await request('GET', `/summary/${user.id}`);
      setSummary(s);
    } catch (e) { setError(e.toString()); }
  };

  useEffect(() => {
    const saved = localStorage.getItem('carkeeper_user');
    if (saved) { 
        setUser(JSON.parse(saved)); 
        setView('dashboard'); 
    } else {
        setView('login');
    }
  }, []);

  useEffect(() => { if (user) fetchData(); }, [user]);

  const handleSelect = async (v) => {
    setSelectedVehicle(v);
    try {
      const h = await request('GET', `/records?vehicle_id=${v.id}`);
      setHistory(h);
    } catch (e) { setHistory([]); }
  };

  const deleteVehicle = async (id) => {
    if(!window.confirm("Delete this vehicle and all records?")) return;
    try {
        await request('DELETE', `/vehicles/${id}`);
        if (selectedVehicle?.id === id) setSelectedVehicle(null);
        fetchData();
    } catch (e) { setError("Failed to delete vehicle"); }
  };

  const deleteRecord = async (id) => {
    try {
        await request('DELETE', `/records/${id}`);
        if (selectedVehicle) handleSelect(selectedVehicle);
        fetchData();
    } catch (e) { setError("Failed to delete record"); }
  };

  const updateVehicle = async () => {
    try {
      await request('PUT', `/vehicles/${editingVehicle.id}`, editingVehicle);
      setEditingVehicle(null);
      fetchData();
      if (selectedVehicle?.id === editingVehicle.id) {
        setSelectedVehicle(editingVehicle);
      }
    } catch (e) { setError("Failed to update vehicle"); }
  };

  const updateRecord = async () => {
    try {
      await request('PUT', `/records/${editingRecord.id}`, editingRecord);
      setEditingRecord(null);
      if (selectedVehicle) handleSelect(selectedVehicle);
      fetchData();
    } catch (e) { setError("Failed to update record"); }
  };

  const checkOilWarning = (v, records) => {
    const oilChanges = (records || []).filter(r => 
      r.task.toLowerCase().includes('oil') || 
      r.task.toLowerCase().includes('maintenance')
    );
    if (oilChanges.length === 0) return v.current_mileage > 5000;
    const lastChange = Math.max(...oilChanges.map(r => r.mileage));
    return (v.current_mileage - lastChange) > 5000;
  };

  if (view === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-cyan-400 mx-auto mb-4" />
        <p className="text-lg font-bold text-white">Loading CarKeeper...</p>
      </div>
    </div>
  );

  if (view === 'login' || view === 'register') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0wLTEwYzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMC0xMGMwLTIuMjEtMS43OS00LTQtNHMtNCAxLjc5LTQgNCAxLjc5IDQgNCA0IDQtMS43OSA0LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20"></div>
        
        <div className="backdrop-blur-xl bg-white/10 p-10 rounded-3xl w-full max-w-md shadow-2xl border border-white/20 relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg mb-4">
              <Car className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-black text-white mb-2">CarKeeper</h1>
            <p className="text-white/80 text-sm">Track your vehicle maintenance with ease</p>
          </div>
          
          <div className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await request('POST', view === 'login' ? '/login' : '/register', authData);
              if(view === 'login') {
                setUser(res.user);
                localStorage.setItem('carkeeper_user', JSON.stringify(res.user));
                setView('dashboard');
              } else {
                setView('login');
                setError("Account created! Please login.");
              }
            } catch (e) { setError(e.toString()); }
          }}>
            <input 
              className="w-full p-4 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 outline-none focus:bg-white/30 focus:border-cyan-400 transition-all" 
              placeholder="Username" 
              onChange={e=>setAuthData({...authData, username: e.target.value})} 
              required 
            />
            <input 
              className="w-full p-4 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 outline-none focus:bg-white/30 focus:border-cyan-400 transition-all" 
              type="password" 
              placeholder="Password" 
              onChange={e=>setAuthData({...authData, password: e.target.value})} 
              required 
            />
            <button 
              onClick={async (e) => {
                e.preventDefault();
                try {
                  const res = await request('POST', view === 'login' ? '/login' : '/register', authData);
                  if(view === 'login') {
                    setUser(res.user);
                    localStorage.setItem('carkeeper_user', JSON.stringify(res.user));
                    setView('dashboard');
                  } else {
                    setView('login');
                    setError("Account created! Please login.");
                  }
                } catch (e) { setError(e.toString()); }
              }}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-4 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
            >
              {view === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            {error && <p className="text-yellow-300 text-center text-sm font-semibold">{error}</p>}
          </div>
          
          <button 
            onClick={() => {setView(view === 'login' ? 'register' : 'login'); setError('');}} 
            className="w-full mt-6 text-sm text-white/80 hover:text-white transition-colors"
          >
            {view === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex">
      <nav className="w-56 bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 text-white p-6 flex flex-col fixed h-full shadow-2xl border-r border-white/10">
        <div className="flex items-center gap-2 mb-10">
          <div className="bg-gradient-to-br from-cyan-400 to-blue-500 p-2 rounded-xl shadow-lg">
            <Car className="w-5 h-5" />
          </div>
          <span className="text-xl font-black">CarKeeper</span>
        </div>
        
        <div className="flex-1 space-y-2">
          <button className="flex items-center gap-3 w-full p-3 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 backdrop-blur-sm rounded-xl border border-cyan-400/30 text-sm font-bold shadow-lg">
            <LayoutDashboard size={16}/> Dashboard
          </button>
        </div>
        
        <button 
          onClick={()=>{localStorage.clear(); window.location.reload();}} 
          className="text-white/60 hover:text-white flex items-center gap-2 text-sm font-bold p-3 hover:bg-white/10 rounded-xl transition-all"
        >
          <LogOut size={16}/> Sign Out
        </button>
      </nav>

      <main className="flex-1 ml-56 p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-5xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">My Garage</h2>
            <p className="text-sm text-slate-500 font-semibold mt-1">{summary.vehicle_count} vehicles • ${Number(summary.total_cost).toLocaleString()} total spent</p>
          </div>
          
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-6 rounded-2xl shadow-xl border border-white/20">
            <p className="text-xs text-white/80 font-bold mb-1">Total Investment</p>
            <p className="text-3xl font-black text-white">${Number(summary.total_cost).toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-7 space-y-6">
            <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/40">
              <h3 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"></div>
                Register Vehicle
              </h3>
              <div className="space-y-3" onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await request('POST', '/vehicles', {...vForm, user_id: user.id});
                  setVForm({ make: '', model: '', year: '', license_plate: '', current_mileage: '' });
                  fetchData();
                } catch (e) { setError("Failed to add vehicle"); }
              }}>
                <div className="flex gap-3">
                  <input className="w-20 p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl font-semibold text-sm outline-none focus:border-blue-500 focus:shadow-lg transition-all" placeholder="Year" value={vForm.year} onChange={e=>setVForm({...vForm, year: e.target.value})} required />
                  <input className="flex-1 p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl font-semibold text-sm outline-none focus:border-blue-500 focus:shadow-lg transition-all" placeholder="Make" value={vForm.make} onChange={e=>setVForm({...vForm, make: e.target.value})} required />
                  <input className="flex-1 p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl font-semibold text-sm outline-none focus:border-blue-500 focus:shadow-lg transition-all" placeholder="Model" value={vForm.model} onChange={e=>setVForm({...vForm, model: e.target.value})} required />
                </div>
                <div className="flex gap-3">
                  <input className="flex-1 p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl font-semibold text-sm outline-none focus:border-blue-500 focus:shadow-lg transition-all" placeholder="License Plate" value={vForm.license_plate} onChange={e=>setVForm({...vForm, license_plate: e.target.value})} />
                  <input className="flex-1 p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl font-semibold text-sm outline-none focus:border-blue-500 focus:shadow-lg transition-all" type="number" placeholder="Current Mileage" value={vForm.current_mileage} onChange={e=>setVForm({...vForm, current_mileage: e.target.value})} required />
                </div>
                <button 
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      await request('POST', '/vehicles', {...vForm, user_id: user.id});
                      setVForm({ make: '', model: '', year: '', license_plate: '', current_mileage: '' });
                      fetchData();
                    } catch (e) { setError("Failed to add vehicle"); }
                  }}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white p-3 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                >
                  Add Vehicle
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {vehicles.map(v => (
                <div key={v.id}>
                  {editingVehicle?.id === v.id ? (
                    <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-xl border-2 border-purple-300">
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <input className="w-20 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={editingVehicle.year} onChange={e=>setEditingVehicle({...editingVehicle, year: e.target.value})} />
                          <input className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={editingVehicle.make} onChange={e=>setEditingVehicle({...editingVehicle, make: e.target.value})} />
                          <input className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={editingVehicle.model} onChange={e=>setEditingVehicle({...editingVehicle, model: e.target.value})} />
                        </div>
                        <div className="flex gap-3">
                          <input className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={editingVehicle.license_plate} onChange={e=>setEditingVehicle({...editingVehicle, license_plate: e.target.value})} placeholder="License Plate" />
                          <input className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" type="number" value={editingVehicle.current_mileage} onChange={e=>setEditingVehicle({...editingVehicle, current_mileage: e.target.value})} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={updateVehicle} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"><Save size={16}/>Save</button>
                          <button onClick={()=>setEditingVehicle(null)} className="flex-1 bg-slate-200 text-slate-700 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"><X size={16}/>Cancel</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => handleSelect(v)} className={`bg-white/60 backdrop-blur-xl p-6 rounded-3xl transition-all cursor-pointer relative group shadow-lg hover:shadow-2xl ${selectedVehicle?.id === v.id ? 'border-2 border-purple-400 shadow-2xl scale-105' : 'border border-white/40 hover:border-purple-200'}`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className={`p-4 rounded-2xl shadow-lg ${selectedVehicle?.id === v.id ? 'bg-gradient-to-br from-purple-500 to-blue-500 text-white' : 'bg-gradient-to-br from-slate-100 to-blue-100 text-slate-600'}`}>
                            <Car size={24}/>
                          </div>
                          <div>
                            <h4 className="text-xl font-black text-slate-800">{v.year} {v.make} {v.model}</h4>
                            <p className="text-xs text-slate-500 font-semibold mt-1">{v.license_plate || 'No plate'} • {Number(v.current_mileage).toLocaleString()} miles</p>
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e)=>{e.stopPropagation(); setEditingVehicle(v);}} className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors"><Edit2 size={16}/></button>
                          <button onClick={(e)=>{e.stopPropagation(); deleteVehicle(v.id);}} className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"><Trash2 size={16}/></button>
                        </div>
                      </div>
                      {checkOilWarning(v, history) && selectedVehicle?.id === v.id && (
                        <div className="absolute -top-3 -right-3 bg-gradient-to-r from-red-500 to-orange-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-bounce">
                          <AlertTriangle size={14}/> <span className="text-xs font-black">Service Due</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-5">
            {selectedVehicle ? (
              <div className="space-y-6">
                <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/40 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-blue-400/20 rounded-full blur-3xl"></div>
                  
                  <div className="flex justify-between items-center mb-6 relative z-10">
                    <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                      <Wrench size={16} className="text-purple-600"/> Add Service
                    </h3>
                    
                    <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-full transition-all ${isAnalyzing ? 'bg-blue-100 text-blue-600' : 'bg-gradient-to-r from-purple-100 to-blue-100 text-purple-600 hover:shadow-lg'}`}>
                      {isAnalyzing ? <Loader2 className="animate-spin" size={14}/> : <Upload size={14}/>}
                      <span className="text-xs font-bold">{isAnalyzing ? 'Analyzing...' : 'Scan Receipt'}</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isAnalyzing} />
                    </label>
                  </div>

                  {showItemSelector && extractedItems.length > 0 && (
                    <div className="mb-4 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border border-blue-200 relative z-10">
                      <p className="text-xs font-bold text-blue-900 mb-3">Select service to add:</p>
                      <div className="space-y-2">
                        {extractedItems.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => selectExtractedItem(item)}
                            className="w-full p-3 bg-white rounded-xl hover:bg-blue-50 transition-all text-left flex justify-between items-center shadow-sm hover:shadow-md"
                          >
                            <span className="text-sm font-bold text-slate-800">{item.task}</span>
                            <span className="text-sm font-black text-blue-600">${item.cost}</span>
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={() => {setShowItemSelector(false); setExtractedItems([]);}}
                        className="mt-3 text-xs font-bold text-slate-400 hover:text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <div className="space-y-3 relative z-10" onSubmit={async (e)=>{
                    e.preventDefault();
                    try {
                      await request('POST', '/records', {...rForm, vehicle_id: selectedVehicle.id});
                      setRForm({ date: new Date().toISOString().split('T')[0], task: '', cost: '', mileage: '', verification_hash: '' });
                      const updatedVehicle = {...selectedVehicle, current_mileage: parseInt(rForm.mileage)};
                      setSelectedVehicle(updatedVehicle);
                      handleSelect(updatedVehicle);
                      fetchData();
                    } catch (e) { setError(e.toString()); }
                  }}>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 text-slate-400" size={16}/>
                      <input type="date" className="w-full p-3 pl-10 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl font-semibold text-sm outline-none focus:border-purple-400 focus:shadow-lg transition-all" value={rForm.date} onChange={e=>setRForm({...rForm, date: e.target.value})} required />
                    </div>
                    <input className="w-full p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl font-semibold text-sm outline-none focus:border-purple-400 focus:shadow-lg transition-all" placeholder="Service description (e.g. Oil change)" value={rForm.task} onChange={e=>setRForm({...rForm, task: e.target.value})} required />
                    <div className="flex gap-3">
                      <input className="flex-1 p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl font-semibold text-sm outline-none focus:border-purple-400 focus:shadow-lg transition-all" type="number" step="0.01" placeholder="Cost ($)" value={rForm.cost} onChange={e=>setRForm({...rForm, cost: e.target.value})} required />
                      <input className="flex-1 p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl font-semibold text-sm outline-none focus:border-purple-400 focus:shadow-lg transition-all" type="number" placeholder="Mileage" value={rForm.mileage} onChange={e=>setRForm({...rForm, mileage: e.target.value})} required />
                    </div>
                    
                    {rForm.verification_hash && (
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-xl flex items-center gap-3 border border-green-200 shadow-sm">
                        <CheckCircle2 className="text-green-600" size={16}/>
                        <div className="overflow-hidden flex-1">
                          <p className="text-xs font-black text-green-700">✓ Receipt Verified</p>
                          <p className="text-xs font-mono text-green-600 truncate">{rForm.verification_hash}</p>
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={async (e)=>{
                        e.preventDefault();
                        try {
                          await request('POST', '/records', {...rForm, vehicle_id: selectedVehicle.id});
                          setRForm({ date: new Date().toISOString().split('T')[0], task: '', cost: '', mileage: '', verification_hash: '' });
                          const updatedVehicle = {...selectedVehicle, current_mileage: parseInt(rForm.mileage)};
                          setSelectedVehicle(updatedVehicle);
                          handleSelect(updatedVehicle);
                          fetchData();
                        } catch (e) { setError(e.toString()); }
                      }}
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                    >
                      Save Service Record
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-black text-slate-700 px-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500"></div>
                    Service History
                  </h3>
                  {history.length === 0 ? (
                    <div className="bg-white/40 backdrop-blur-xl p-10 rounded-3xl text-center border border-white/40">
                      <Activity size={40} className="mx-auto mb-3 text-slate-300"/>
                      <p className="text-sm text-slate-400 font-semibold">No service records yet</p>
                    </div>
                  ) : (
                    history.map(h => (
                      <div key={h.id}>
                        {editingRecord?.id === h.id ? (
                          <div className="bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-xl border-2 border-purple-300">
                            <div className="space-y-2">
                              <input type="date" className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" value={editingRecord.date} onChange={e=>setEditingRecord({...editingRecord, date: e.target.value})} />
                              <input className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" value={editingRecord.task} onChange={e=>setEditingRecord({...editingRecord, task: e.target.value})} />
                              <div className="flex gap-2">
                                <input className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" type="number" step="0.01" value={editingRecord.cost} onChange={e=>setEditingRecord({...editingRecord, cost: e.target.value})} />
                                <input className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" type="number" value={editingRecord.mileage} onChange={e=>setEditingRecord({...editingRecord, mileage: e.target.value})} />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={updateRecord} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white p-2 rounded-lg font-bold text-sm flex items-center justify-center gap-1"><Save size={14}/>Save</button>
                                <button onClick={()=>setEditingRecord(null)} className="flex-1 bg-slate-200 text-slate-700 p-2 rounded-lg font-bold text-sm flex items-center justify-center gap-1"><X size={14}/>Cancel</button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white/60 backdrop-blur-xl p-4 rounded-2xl flex justify-between items-center group shadow-lg hover:shadow-xl transition-all border border-white/40 hover:border-purple-200">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full shadow-lg ${h.v_hash ? 'bg-gradient-to-r from-green-400 to-emerald-400' : 'bg-gradient-to-r from-blue-400 to-purple-400'}`}></div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-black text-slate-800">{h.task}</p>
                                  {h.v_hash && <CheckCircle2 size={12} className="text-green-600"/>}
                                </div>
                                <p className="text-xs text-slate-500 font-semibold mt-0.5">{h.date} • {Number(h.mileage).toLocaleString()} mi</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">${Number(h.cost).toLocaleString()}</span>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={()=>setEditingRecord(h)} className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors"><Edit2 size={14}/></button>
                                <button onClick={()=>deleteRecord(h.id)} className="p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"><Trash2 size={14}/></button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="h-96 bg-white/40 backdrop-blur-xl border-2 border-dashed border-slate-300 rounded-3xl flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center mb-4">
                  <Activity size={32} className="text-slate-400"/>
                </div>
                <p className="text-sm font-bold text-slate-500">Select a vehicle to view details</p>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {error && (
        <div className={`fixed bottom-6 right-6 p-5 rounded-2xl shadow-2xl flex items-center gap-3 z-50 backdrop-blur-xl border ${error.includes('Found') ? 'bg-green-500/90 border-green-400 text-white' : 'bg-red-500/90 border-red-400 text-white'}`}>
          <AlertTriangle size={20}/>
          <div className="flex-1">
            <p className="text-xs font-bold opacity-80">System Alert</p>
            <p className="text-sm font-black">{error}</p>
          </div>
          <button onClick={()=>setError('')} className="bg-white/20 hover:bg-white/30 p-2 rounded-lg font-bold transition-colors">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;