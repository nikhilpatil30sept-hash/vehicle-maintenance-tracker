import React, { useState } from 'react';
import { Activity, Trash2, Edit2, X, Save, ScanLine, Loader2 } from 'lucide-react';

const editInputClass = 'p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm';

const RecordRow = ({ record, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(record);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onUpdate(record.id, draft);
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
      <div className="bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-xl border-2 border-purple-300">
        <form className="space-y-2" onSubmit={handleSave}>
          <input type="date" aria-label="Service date" className={`w-full ${editInputClass}`} value={draft.date} onChange={set('date')} required />
          <input aria-label="Service description" maxLength={500} className={`w-full ${editInputClass}`} value={draft.task} onChange={set('task')} required />
          <div className="flex gap-2">
            <input className={`flex-1 ${editInputClass}`} type="number" step="0.01" min="0" aria-label="Cost" value={draft.cost} onChange={set('cost')} required />
            <input className={`flex-1 ${editInputClass}`} type="number" min="0" aria-label="Mileage" value={draft.mileage} onChange={set('mileage')} required />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white p-2 rounded-lg font-bold text-sm flex items-center justify-center gap-1 disabled:opacity-60">
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="flex-1 bg-slate-200 text-slate-700 p-2 rounded-lg font-bold text-sm flex items-center justify-center gap-1">
              <X size={14} />Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  const scanned = Boolean(record.receipt_fingerprint);

  return (
    <div className="bg-white/60 backdrop-blur-xl p-4 rounded-2xl flex justify-between items-center group shadow-lg hover:shadow-xl transition-all border border-white/40 hover:border-purple-200">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full shadow-lg ${scanned ? 'bg-gradient-to-r from-blue-400 to-indigo-400' : 'bg-gradient-to-r from-slate-300 to-slate-400'}`}></div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-slate-800">{record.task}</p>
            {scanned && <ScanLine size={12} className="text-blue-600" aria-label="Scanned from receipt" />}
          </div>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            {record.date} • {Number(record.mileage || 0).toLocaleString()} mi
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          ${Number(record.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button type="button" aria-label={`Edit ${record.task}`} onClick={() => { setDraft(record); setEditing(true); }} className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors">
            <Edit2 size={14} />
          </button>
          <button type="button" aria-label={`Delete ${record.task}`} onClick={() => onDelete(record)} className="p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const RecordList = ({ records, loading, onUpdate, onDelete }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-black text-slate-700 px-2 flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500"></div>
      Service History
    </h3>

    {loading ? (
      <div className="bg-white/40 backdrop-blur-xl p-10 rounded-3xl text-center border border-white/40">
        <Loader2 size={32} className="mx-auto mb-3 text-slate-300 animate-spin" />
        <p className="text-sm text-slate-400 font-semibold">Loading history...</p>
      </div>
    ) : records.length === 0 ? (
      <div className="bg-white/40 backdrop-blur-xl p-10 rounded-3xl text-center border border-white/40">
        <Activity size={40} className="mx-auto mb-3 text-slate-300" />
        <p className="text-sm text-slate-400 font-semibold">No service records yet</p>
      </div>
    ) : (
      records.map((record) => (
        <RecordRow key={record.id} record={record} onUpdate={onUpdate} onDelete={onDelete} />
      ))
    )}
  </div>
);

export default RecordList;
