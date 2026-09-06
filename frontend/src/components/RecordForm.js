import React, { useState } from 'react';
import { Wrench, Calendar, Upload, Loader2, ScanLine } from 'lucide-react';
import { api, AuthError, ApiError } from '../api';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const today = () => new Date().toISOString().split('T')[0];
const emptyForm = () => ({ date: today(), task: '', cost: '', mileage: '', receipt_fingerprint: '' });

const inputClass =
  'p-3 bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-200 rounded-xl ' +
  'font-semibold text-sm outline-none focus:border-purple-400 focus:shadow-lg transition-all';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/** Parse the model's JSON reply, tolerating markdown fences. */
function parseOcrText(text) {
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return {
    date: typeof parsed.date === 'string' ? parsed.date : null,
    mileage: Number.isFinite(Number(parsed.mileage)) ? Number(parsed.mileage) : null,
    items: items
      .filter((i) => i && typeof i.task === 'string' && i.task.trim())
      // Guard the cost: the model omits it often enough that `item.cost.toString()`
      // used to throw and take the whole app down.
      .map((i) => ({ task: i.task.trim(), cost: Number.isFinite(Number(i.cost)) ? Number(i.cost) : 0 })),
  };
}

const RecordForm = ({ vehicle, onCreate, onNotify }) => {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedItems, setExtractedItems] = useState([]);
  const [fingerprint, setFingerprint] = useState('');

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onCreate({ ...form, vehicle_id: vehicle.id });
      setForm(emptyForm()); // only cleared on success
      setFingerprint('');
    } catch {
      // The parent already reported this via the toast.
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onNotify('Please upload an image file', 'error');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      onNotify('That image is larger than 5 MB. Try a smaller photo.', 'error');
      return;
    }

    setAnalyzing(true);
    setExtractedItems([]);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = String(dataUrl).split(',')[1];
      const result = await api.ocr(base64, file.type);
      const extracted = parseOcrText(result.text);

      if (extracted.items.length === 0) {
        onNotify('No service items found on that receipt. Enter the details manually.', 'error');
        return;
      }

      setExtractedItems(extracted.items);
      setFingerprint(result.receipt_fingerprint || '');
      setForm((prev) => ({
        ...prev,
        date: extracted.date || prev.date,
        mileage: extracted.mileage != null ? String(extracted.mileage) : prev.mileage,
      }));
      onNotify(`Found ${extracted.items.length} service item(s). Pick one to add.`, 'success');
    } catch (err) {
      // A 401 is already handled globally (session cleared, back to login), and
      // retrying it - as the old exponential-backoff loop did - is pointless.
      if (err instanceof AuthError) return;
      if (err instanceof SyntaxError) {
        onNotify('Could not read that receipt. Enter the details manually.', 'error');
      } else if (err instanceof ApiError) {
        onNotify(err.message, 'error');
      } else {
        onNotify(err.message || 'Receipt analysis failed. Enter the details manually.', 'error');
      }
    } finally {
      // Runs exactly once, when analysis is genuinely over. The old version put
      // this in a `finally` that fired on the first of several retry attempts,
      // so the spinner stopped while work was still in flight.
      setAnalyzing(false);
    }
  };

  const selectExtractedItem = (item) => {
    setForm((prev) => ({
      ...prev,
      task: item.task,
      cost: String(item.cost),
      receipt_fingerprint: fingerprint,
    }));
    setExtractedItems([]);
  };

  return (
    <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/40 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-blue-400/20 rounded-full blur-3xl"></div>

      <div className="flex justify-between items-center mb-6 relative z-10">
        <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
          <Wrench size={16} className="text-purple-600" /> Add Service
        </h3>

        <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-full transition-all ${analyzing ? 'bg-blue-100 text-blue-600' : 'bg-gradient-to-r from-purple-100 to-blue-100 text-purple-600 hover:shadow-lg'}`}>
          {analyzing ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
          <span className="text-xs font-bold">{analyzing ? 'Analyzing...' : 'Scan Receipt'}</span>
          <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={analyzing} />
        </label>
      </div>

      {extractedItems.length > 0 && (
        <div className="mb-4 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border border-blue-200 relative z-10">
          <p className="text-xs font-bold text-blue-900 mb-3">Select service to add:</p>
          <div className="space-y-2">
            {extractedItems.map((item, idx) => (
              <button
                key={`${item.task}-${idx}`}
                type="button"
                onClick={() => selectExtractedItem(item)}
                className="w-full p-3 bg-white rounded-xl hover:bg-blue-50 transition-all text-left flex justify-between items-center shadow-sm hover:shadow-md"
              >
                <span className="text-sm font-bold text-slate-800">{item.task}</span>
                <span className="text-sm font-black text-blue-600">${item.cost.toFixed(2)}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setExtractedItems([])} className="mt-3 text-xs font-bold text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        </div>
      )}

      <form className="space-y-3 relative z-10" onSubmit={handleSubmit}>
        <div className="relative">
          <Calendar className="absolute left-3 top-3 text-slate-400" size={16} />
          <input type="date" aria-label="Service date" max={today()} className={`w-full pl-10 ${inputClass}`} value={form.date} onChange={set('date')} required />
        </div>
        <input className={`w-full ${inputClass}`} placeholder="Service description (e.g. Oil change)" aria-label="Service description" maxLength={500} value={form.task} onChange={set('task')} required />
        <div className="flex gap-3">
          <input className={`flex-1 ${inputClass}`} type="number" step="0.01" min="0" placeholder="Cost ($)" aria-label="Cost" value={form.cost} onChange={set('cost')} required />
          <input className={`flex-1 ${inputClass}`} type="number" min="0" placeholder="Mileage" aria-label="Mileage" value={form.mileage} onChange={set('mileage')} required />
        </div>

        {form.receipt_fingerprint && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-xl flex items-center gap-3 border border-blue-200 shadow-sm">
            <ScanLine className="text-blue-600" size={16} />
            <div className="overflow-hidden flex-1">
              {/* Honest wording: this identifies the source image, it does not
                  attest that the receipt is genuine. */}
              <p className="text-xs font-black text-blue-700">Scanned from receipt</p>
              <p className="text-xs font-mono text-blue-600 truncate" title={form.receipt_fingerprint}>
                {form.receipt_fingerprint}
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="animate-spin" size={16} />}
          Save Service Record
        </button>
      </form>
    </div>
  );
};

export default RecordForm;
