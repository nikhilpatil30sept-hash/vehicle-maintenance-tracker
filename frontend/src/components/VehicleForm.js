import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

const EMPTY = { make: '', model: '', year: '', license_plate: '', current_mileage: '' };

const inputClass =
  'p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl ' +
  'font-semibold text-sm outline-none focus:border-blue-500 focus:shadow-lg transition-all';

/** Registration form for a new vehicle. A real <form>, with a submit guard. */
const VehicleForm = ({ onCreate }) => {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const currentYear = new Date().getFullYear();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return; // double-click used to create duplicate vehicles
    setSubmitting(true);
    try {
      await onCreate(form);
      setForm(EMPTY); // only cleared on success, so a rejection keeps the input
    } catch {
      // The parent already reported this via the toast.
    } finally {
      setSubmitting(false);
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/40">
      <h3 className="text-sm font-black text-slate-700 mb-4 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"></div>
        Register Vehicle
      </h3>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="flex gap-3">
          <input
            className={`w-24 ${inputClass}`}
            type="number"
            placeholder="Year"
            aria-label="Year"
            min="1885"
            max={currentYear + 2}
            value={form.year}
            onChange={set('year')}
            required
          />
          <input
            className={`flex-1 ${inputClass}`}
            placeholder="Make"
            aria-label="Make"
            maxLength={80}
            value={form.make}
            onChange={set('make')}
            required
          />
          <input
            className={`flex-1 ${inputClass}`}
            placeholder="Model"
            aria-label="Model"
            maxLength={80}
            value={form.model}
            onChange={set('model')}
            required
          />
        </div>
        <div className="flex gap-3">
          <input
            className={`flex-1 ${inputClass}`}
            placeholder="License Plate"
            aria-label="License plate"
            maxLength={20}
            value={form.license_plate}
            onChange={set('license_plate')}
          />
          <input
            className={`flex-1 ${inputClass}`}
            type="number"
            min="0"
            placeholder="Current Mileage"
            aria-label="Current mileage"
            value={form.current_mileage}
            onChange={set('current_mileage')}
            required
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white p-3 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="animate-spin" size={14} />}
          Add Vehicle
        </button>
      </form>
    </div>
  );
};

export default VehicleForm;
