import React from 'react';
import { Car, LogOut, LayoutDashboard, Activity } from 'lucide-react';
import VehicleForm from './VehicleForm';
import VehicleCard from './VehicleCard';
import RecordForm from './RecordForm';
import RecordList from './RecordList';
import { getOilChangeStatus } from '../maintenance';

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Dashboard = ({
  vehicles,
  summary,
  selectedVehicle,
  history,
  historyLoading = false,
  onSelectVehicle,
  onCreateVehicle,
  onUpdateVehicle,
  onDeleteVehicle,
  onCreateRecord,
  onUpdateRecord,
  onDeleteRecord,
  onSignOut,
  onNotify,
}) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex">
    <nav className="w-56 bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 text-white p-6 flex flex-col fixed h-full shadow-2xl border-r border-white/10">
      <div className="flex items-center gap-2 mb-10">
        <div className="bg-gradient-to-br from-cyan-400 to-blue-500 p-2 rounded-xl shadow-lg">
          <Car className="w-5 h-5" />
        </div>
        <span className="text-xl font-black">CarKeeper</span>
      </div>

      <div className="flex-1 space-y-2">
        <button type="button" className="flex items-center gap-3 w-full p-3 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 backdrop-blur-sm rounded-xl border border-cyan-400/30 text-sm font-bold shadow-lg">
          <LayoutDashboard size={16} /> Dashboard
        </button>
      </div>

      <button type="button" onClick={onSignOut} className="text-white/60 hover:text-white flex items-center gap-2 text-sm font-bold p-3 hover:bg-white/10 rounded-xl transition-all">
        <LogOut size={16} /> Sign Out
      </button>
    </nav>

    <main className="flex-1 ml-56 p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-5xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">My Garage</h2>
          <p className="text-sm text-slate-500 font-semibold mt-1">
            {summary.vehicle_count} vehicles • ${money(summary.total_cost)} total spent
          </p>
        </div>

        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-6 rounded-2xl shadow-xl border border-white/20">
          <p className="text-xs text-white/80 font-bold mb-1">Total Investment</p>
          <p className="text-3xl font-black text-white">${money(summary.total_cost)}</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <VehicleForm onCreate={onCreateVehicle} />

          <div className="space-y-3">
            {vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                isSelected={selectedVehicle?.id === vehicle.id}
                // Service status is only meaningful for the vehicle whose history
                // is loaded; other cards would otherwise be judged against the
                // selected vehicle's records. Skipping it while the history is
                // still in flight also avoids a "Service Due" badge flashing on
                // every selection, since an empty history reads as overdue.
                serviceStatus={
                  selectedVehicle?.id === vehicle.id && !historyLoading
                    ? getOilChangeStatus(vehicle, history)
                    : null
                }
                onSelect={onSelectVehicle}
                onUpdate={onUpdateVehicle}
                onDelete={onDeleteVehicle}
              />
            ))}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5">
          {selectedVehicle ? (
            <div className="space-y-6">
              <RecordForm vehicle={selectedVehicle} onCreate={onCreateRecord} onNotify={onNotify} />
              <RecordList
                records={history}
                loading={historyLoading}
                onUpdate={onUpdateRecord}
                onDelete={onDeleteRecord}
              />
            </div>
          ) : (
            <div className="h-96 bg-white/40 backdrop-blur-xl border-2 border-dashed border-slate-300 rounded-3xl flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center mb-4">
                <Activity size={32} className="text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-500">Select a vehicle to view details</p>
            </div>
          )}
        </div>
      </div>
    </main>
  </div>
);

export default Dashboard;
