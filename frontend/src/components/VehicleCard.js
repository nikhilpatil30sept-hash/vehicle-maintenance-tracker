import React, { useState } from 'react';
import { Car, AlertTriangle, Trash2, Edit2, X, Save, Loader2 } from 'lucide-react';

const editInputClass = 'p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm';

const VehicleCard = ({ vehicle, isSelected, serviceStatus, onSelect, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(vehicle);
  const [saving, setSaving] = useState(false);

  const startEditing = (e) => {
    e.stopPropagation();
    setDraft(vehicle); // always seed from current props, never stale state
    setEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onUpdate(vehicle.id, draft);
      setEditing(false); // stay in edit mode on failure so the draft is not lost
    } catch {
      // The parent already reported this via the toast.
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    const set = (field) => (e) => setDraft({ ...draft, [field]: e.target.value });
    return (
      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-xl border-2 border-purple-300">
        <form className="space-y-3" onSubmit={handleSave}>
          <div className="flex gap-3">
            <input className={`w-24 ${editInputClass}`} type="number" aria-label="Year" value={draft.year} onChange={set('year')} required />
            <input className={`flex-1 ${editInputClass}`} aria-label="Make" maxLength={80} value={draft.make} onChange={set('make')} required />
            <input className={`flex-1 ${editInputClass}`} aria-label="Model" maxLength={80} value={draft.model} onChange={set('model')} required />
          </div>
          <div className="flex gap-3">
            <input className={`flex-1 ${editInputClass}`} aria-label="License plate" maxLength={20} value={draft.license_plate || ''} onChange={set('license_plate')} placeholder="License Plate" />
            <input className={`flex-1 ${editInputClass}`} type="number" min="0" aria-label="Current mileage" value={draft.current_mileage} onChange={set('current_mileage')} required />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="flex-1 bg-slate-200 text-slate-700 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
              <X size={16} />Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(vehicle)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(vehicle);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={`bg-white/60 backdrop-blur-xl p-6 rounded-3xl transition-all cursor-pointer relative group shadow-lg hover:shadow-2xl ${
        isSelected ? 'border-2 border-purple-400 shadow-2xl scale-105' : 'border border-white/40 hover:border-purple-200'
      }`}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className={`p-4 rounded-2xl shadow-lg ${isSelected ? 'bg-gradient-to-br from-purple-500 to-blue-500 text-white' : 'bg-gradient-to-br from-slate-100 to-blue-100 text-slate-600'}`}>
            <Car size={24} />
          </div>
          <div>
            <h4 className="text-xl font-black text-slate-800">{vehicle.year} {vehicle.make} {vehicle.model}</h4>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              {vehicle.license_plate || 'No plate'} • {Number(vehicle.current_mileage || 0).toLocaleString()} miles
            </p>
          </div>
        </div>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button type="button" aria-label={`Edit ${vehicle.make} ${vehicle.model}`} onClick={startEditing} className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors">
            <Edit2 size={16} />
          </button>
          <button type="button" aria-label={`Delete ${vehicle.make} ${vehicle.model}`} onClick={(e) => { e.stopPropagation(); onDelete(vehicle); }} className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {serviceStatus?.due && (
        <div
          title={serviceStatus.reason}
          className="absolute -top-3 -right-3 bg-gradient-to-r from-red-500 to-orange-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
        >
          <AlertTriangle size={14} /> <span className="text-xs font-black">Service Due</span>
        </div>
      )}
    </div>
  );
};

export default VehicleCard;
