import React, { useState, useEffect } from 'react';
import { 
  Car, Wrench, LogOut, LayoutDashboard, 
  ShieldCheck, Activity, Trash2, AlertTriangle, Calendar, 
  Loader2, CheckCircle2, Upload, DollarSign, Gauge
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
          console.error("Gemini API Error:", errorData);
          
          if (retries < 3) {
            const delay = Math.pow(2, retries) * 1000;
            await new Promise(r => setTimeout(r, delay));
            return fetchWithRetry(retries + 1);
          }
          throw new Error(errorData.error?.message || "API request failed");
        }

        const result = await response.json();
        console.log("Gemini Response:", result);
        
        let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("No text returned from AI");
        
        const sanitizedJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const extracted = JSON.parse(sanitizedJson);
        
        console.log("Extracted data:", extracted);
        
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
        console.error("OCR Error:", err);
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
    const verificationHash = `CARKEEPER-VERIFIED-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
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
      setError('Please upload an image file (JPG, PNG, etc.)');
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
    const saved = localStorage.getItem('guardian_user');
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

  const checkOilWarning = (v, records) => {
    const oilChanges = (records || []).filter(r => 
      r.task.toLowerCase().includes('oil') || 
      r.task.toLowerCase().includes('maintenance')
    );
    if (oilChanges.length === 0) return v.current_mileage > 5000;
    const lastChange = Math.max(...oilChanges.map(r => r.mileage));
    return (v.current_mileage - lastChange) > 5000;
  };

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-purple-400 mx-auto mb-4" size={48} />
          <p className="text-lg font-bold text-white/80">Loading CarKeeper...</p>
        </div>
      </div>
    );
  }

  if (view === 'login' || view === 'register') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-teal-500 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIxIiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20"></div>
        
        <div className="relative backdrop-blur-xl bg-white/10 p-10 rounded-3xl w-full max-w-md shadow-2xl border border-white/20">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg mb-4">
              <ShieldCheck size={40} className="text-white" />
            </div>
            <h1 className="text-4xl font-black text-white mb-2">CarKeeper</h1>
            <p className="text-white/70 text-sm font-medium">Your vehicle maintenance companion</p>
          </div>
          
          <div className="space-y-4">
            <input 
              className="w-full p-4 bg-white/20 backdrop-blur-md rounded-xl font-semibold text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/50 border border-white/30 transition-all" 
              placeholder="Username" 
              onChange={e=>setAuthData({...authData, username: e.target.value})} 
              required 
            />
            <input 
              className="w-full p-4 bg-white/20 backdrop-blur-md rounded-xl font-semibold text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/50 border border-white/30 transition-all" 
              type="password" 
              placeholder="Password" 
              onChange={e=>setAuthData({...authData, password: e.target.value})} 
              required 
            />
            <button 
              onClick={async () => {
                try {
                  const res = await request('POST', view === 'login' ? '/login' : '/register', authData);
                  if(view === 'login') {
                    setUser(res.user);
                    localStorage.setItem('guardian_user', JSON.stringify(res.user));
                    setView('dashboard');
                  } else {
                    setView('login');
                    setError("Registration successful!");
                  }
                } catch (e) { setError(e.toString()); }
              }}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white p-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl hover:scale-105 transition-all"
            >
              {view === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            {error && <p className="text-white text-center text-sm font-bold bg-red-500/20 backdrop-blur-md p-3 rounded-lg border border-red-400/30">{error}</p>}
          </div>
          
          <button 
            onClick={() => {setView(view === 'login' ? 'register' : 'login'); setError('');}} 
            className="w-full mt-6 text-sm font-semibold text-white/80 hover:text-white transition-colors"
          >
            {view === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex">
      {/* Compact Sidebar */}
      <nav className="w-20 bg-gradient-to-b from-slate-800/50 to-slate-900/50 backdrop-blur-xl border-r border-white/5 p-4 flex flex-col fixed h-full shadow-2xl">
        <div className="flex items-center justify-center mb-8 w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg">
          <ShieldCheck size={24} className="text-white"/>
        </div>
        
        <div className="flex-1 flex flex-col items-center gap-4">
          <button className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-blue-500/20 backdrop-blur-md rounded-xl text-purple-300 hover:text-white border border-purple-500/30 transition-all hover:scale-110 shadow-lg">
            <LayoutDashboard size={20}/>
          </button>
        </div>
        
        <button 
          onClick={()=>{localStorage.clear(); window.location.reload();}} 
          className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
        >
          <LogOut size={20}/>
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 ml-20 p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-blue-400 to-teal-400 mb-2">My Garage</h2>
            <p className="text-sm font-semibold text-slate-400 flex items-center gap-2">
              <Car size={16} className="text-purple-400"/> {summary.vehicle_count} {summary.vehicle_count === 1 ? 'Vehicle' : 'Vehicles'}
            </p>
          </div>
          
          <div className="backdrop-blur-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 p-6 rounded-2xl border border-purple-500/20 shadow-xl min-w-[200px]">
            <div className="flex items-center gap-2 text-purple-300 text-xs font-bold uppercase mb-1">
              <DollarSign size={14}/>
              <span>Total Spent</span>
            </div>
            <p className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
              ${Number(summary.total_cost).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Vehicles */}
          <div className="col-span-7 space-y-6">
            {/* Register Vehicle Form */}
            <div className="backdrop-blur-xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 p-6 rounded-2xl border border-white/10 shadow-xl">
              <h3 className="text-sm font-bold text-purple-300 uppercase mb-4 flex items-center gap-2">
                <Car size={16}/>
                Register Vehicle
              </h3>
              
              <div className="space-y-3">
                <div className="flex gap-3">
                  <input 
                    className="w-24 p-3 bg-white/5 backdrop-blur-md rounded-xl font-semibold text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/10 transition-all" 
                    placeholder="Year" 
                    value={vForm.year} 
                    onChange={e=>setVForm({...vForm, year: e.target.value})} 
                    required 
                  />
                  <input 
                    className="flex-1 p-3 bg-white/5 backdrop-blur-md rounded-xl font-semibold text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/10 transition-all" 
                    placeholder="Make" 
                    value={vForm.make} 
                    onChange={e=>setVForm({...vForm, make: e.target.value})} 
                    required 
                  />
                  <input 
                    className="flex-1 p-3 bg-white/5 backdrop-blur-md rounded-xl font-semibold text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/10 transition-all" 
                    placeholder="Model" 
                    value={vForm.model} 
                    onChange={e=>setVForm({...vForm, model: e.target.value})} 
                    required 
                  />
                </div>
                <div className="flex gap-3">
                  <input 
                    className="flex-1 p-3 bg-white/5 backdrop-blur-md rounded-xl font-semibold text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/10 transition-all" 
                    placeholder="License Plate (Optional)" 
                    value={vForm.license_plate} 
                    onChange={e=>setVForm({...vForm, license_plate: e.target.value})} 
                  />
                  <input 
                    className="flex-1 p-3 bg-white/5 backdrop-blur-md rounded-xl font-semibold text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/10 transition-all" 
                    type="number" 
                    placeholder="Current Mileage" 
                    value={vForm.current_mileage} 
                    onChange={e=>setVForm({...vForm, current_mileage: e.target.value})} 
                    required 
                  />
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
                  className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white p-3 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                >
                  Add Vehicle
                </button>
              </div>
            </div>

            {/* Vehicle List */}
            <div className="space-y-4">
              {vehicles.map(v => (
                <div 
                  key={v.id} 
                  onClick={() => handleSelect(v)} 
                  className={`backdrop-blur-xl p-6 rounded-2xl cursor-pointer relative group transition-all ${
                    selectedVehicle?.id === v.id 
                      ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-500/50 shadow-2xl scale-105' 
                      : 'bg-slate-800/30 border border-white/10 hover:border-purple-500/30 shadow-lg hover:scale-102'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className={`p-4 rounded-xl ${
                        selectedVehicle?.id === v.id 
                          ? 'bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg' 
                          : 'bg-slate-700/50'
                      }`}>
                        <Car size={28} className={selectedVehicle?.id === v.id ? 'text-white' : 'text-slate-400'}/>
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-white">{v.year} {v.make} {v.model}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs font-semibold text-slate-400">{v.license_plate || 'No Plate'}</span>
                          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                            <Gauge size={12}/>
                            {Number(v.current_mileage).toLocaleString()} mi
                          </span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={(e)=>{e.stopPropagation(); deleteVehicle(v.id);}} 
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={18}/>
                    </button>
                  </div>
                  
                  {checkOilWarning(v, history) && selectedVehicle?.id === v.id && (
                    <div className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-orange-500 text-white px-3 py-1 rounded-full shadow-xl flex items-center gap-1 animate-bounce text-xs font-bold">
                      <AlertTriangle size={12}/> Service Due
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Service Log */}
          <div className="col-span-5">
            {selectedVehicle ? (
              <div className="space-y-6">
                {/* Add Service Form */}
                <div className="backdrop-blur-xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 p-6 rounded-2xl border border-white/10 shadow-xl">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-purple-300 uppercase flex items-center gap-2">
                      <Wrench size={16}/>
                      Add Service
                    </h3>
                    
                    <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                      isAnalyzing 
                        ? 'bg-purple-500/20 text-purple-300' 
                        : 'bg-white/5 text-slate-400 hover:bg-purple-500/20 hover:text-purple-300'
                    }`}>
                      {isAnalyzing ? <Loader2 className="animate-spin" size={14}/> : <Upload size={14}/>}
                      <span className="text-xs font-bold">{isAnalyzing ? 'Scanning...' : 'Scan Receipt'}</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isAnalyzing} />
                    </label>
                  </div>

                  {showItemSelector && extractedItems.length > 0 && (
                    <div className="mb-4 p-4 backdrop-blur-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/20">
                      <p className="text-xs font-bold text-purple-300 uppercase mb-3">Select a service:</p>
                      <div className="space-y-2">
                        {extractedItems.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => selectExtractedItem(item)}
                            className="w-full p-3 bg-white/5 backdrop-blur-md rounded-lg hover:bg-white/10 transition-all text-left flex justify-between items-center border border-white/10"
                          >
                            <span className="text-sm font-semibold text-white">{item.task}</span>
                            <span className="text-sm font-bold text-purple-400">${item.cost}</span>
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={() => {setShowItemSelector(false); setExtractedItems([]);}}
                        className="mt-3 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 text-slate-400" size={16}/>
                      <input 
                        type="date" 
                        className="w-full p-3 pl-10 bg-white/5 backdrop-blur-md rounded-xl font-semibold text-white outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/10 transition-all" 
                        value={rForm.date} 
                        onChange={e=>setRForm({...rForm, date: e.target.value})} 
                        required 
                      />
                    </div>
                    <input 
                      className="w-full p-3 bg-white/5 backdrop-blur-md rounded-xl font-semibold text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/10 transition-all" 
                      placeholder="What was done?" 
                      value={rForm.task} 
                      onChange={e=>setRForm({...rForm, task: e.target.value})} 
                      required 
                    />
                    <div className="flex gap-3">
                      <input 
                        className="flex-1 p-3 bg-white/5 backdrop-blur-md rounded-xl font-semibold text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/10 transition-all" 
                        type="number" 
                        step="0.01" 
                        placeholder="Cost ($)" 
                        value={rForm.cost} 
                        onChange={e=>setRForm({...rForm, cost: e.target.value})} 
                        required 
                      />
                      <input 
                        className="flex-1 p-3 bg-white/5 backdrop-blur-md rounded-xl font-semibold text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500/50 border border-white/10 transition-all" 
                        type="number" 
                        placeholder="Mileage" 
                        value={rForm.mileage} 
                        onChange={e=>setRForm({...rForm, mileage: e.target.value})} 
                        required 
                      />
                    </div>
                    
                    {rForm.verification_hash && (
                      <div className="backdrop-blur-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 p-3 rounded-xl flex items-center gap-2 border border-green-500/20">
                        <CheckCircle2 className="text-green-400" size={16}/>
                        <div>
                          <p className="text-xs font-bold text-green-300">Receipt Verified</p>
                          <p className="text-[10px] font-mono text-green-400/70">{rForm.verification_hash}</p>
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
                      className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white p-4 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                    >
                      Save Service Record
                    </button>
                  </div>
                </div>

                {/* Service History */}
                <div className="backdrop-blur-xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 p-6 rounded-2xl border border-white/10 shadow-xl">
                  <h3 className="text-sm font-bold text-purple-300 uppercase mb-4 flex items-center gap-2">
                    <Activity size={16}/>
                    Service History
                  </h3>
                  
                  {history.length === 0 ? (
                    <div className="text-center py-10">
                      <Activity size={40} className="text-slate-600 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-500">No service records yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                      {history.map(h => (
                        <div 
                          key={h.id} 
                          className="backdrop-blur-md bg-white/5 p-4 rounded-xl border border-white/10 hover:border-purple-500/30 transition-all group"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-start gap-3 flex-1">
                              <div className={`w-2 h-2 rounded-full mt-2 ${
                                h.v_hash ? 'bg-green-400 ring-2 ring-green-400/20' : 'bg-purple-400 ring-2 ring-purple-400/20'
                              }`}></div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-bold text-white">{h.task}</p>
                                  {h.v_hash && (
                                    <div className="backdrop-blur-md bg-green-500/20 px-2 py-0.5 rounded-full border border-green-500/30">
                                      <span className="text-[10px] font-bold text-green-300">Verified</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs font-semibold text-slate-400">
                                  <span>{h.date}</span>
                                  <span className="flex items-center gap-1">
                                    <Gauge size={10}/>
                                    {Number(h.mileage).toLocaleString()} mi
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                                ${Number(h.cost).toLocaleString()}
                              </span>
                              <button 
                                onClick={()=>deleteRecord(h.id)} 
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <Trash2 size={14}/>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[600px] backdrop-blur-xl bg-gradient-to-br from-slate-800/20 to-slate-900/20 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center mb-6">
                  <Car size={40} className="text-purple-400" />
                </div>
                <p className="text-lg font-bold text-white mb-2">Select a Vehicle</p>
                <p className="text-sm text-slate-400 max-w-[250px]">Choose a vehicle from the list to view and manage its service history</p>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {error && (
        <div className={`fixed bottom-6 right-6 backdrop-blur-xl p-5 rounded-2xl shadow-2xl flex items-center gap-4 z-50 border max-w-md ${
          error.includes('Found') 
            ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500/30' 
            : 'bg-gradient-to-br from-red-500/20 to-orange-500/20 border-red-500/30'
        }`}>
          <AlertTriangle size={20} className={error.includes('Found') ? 'text-green-400' : 'text-red-400'}/>
          <div className="flex-1">
            <p className="text-xs font-bold text-white/70 uppercase mb-1">System Alert</p>
            <p className="text-sm font-bold text-white">{error}</p>
          </div>
          <button 
            onClick={()=>setError('')} 
            className="backdrop-blur-md bg-white/10 hover:bg-white/20 p-2 rounded-lg font-bold text-white transition-all"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default App;