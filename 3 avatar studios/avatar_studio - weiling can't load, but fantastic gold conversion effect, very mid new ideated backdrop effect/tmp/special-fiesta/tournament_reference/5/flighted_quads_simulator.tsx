import React, { useState, useMemo } from 'react';
import { Clock, Users, MapPin, Trophy, Grid, CalendarDays, Award } from 'lucide-react';

const formatTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const parseTime = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

export default function FlightedQuadsSimulator() {
  const [activeTab, setActiveTab] = useState('flights'); // 'flights' or 'timeline'
  const [numTeams, setNumTeams] = useState(16); // 12 or 16
  const [numCourts, setNumCourts] = useState(3);
  const [matchDuration, setMatchDuration] = useState(20);
  const [startTime, setStartTime] = useState('09:00');

  const scheduleData = useMemo(() => {
    const startMins = parseTime(startTime);
    let courtAvailability = Array(numCourts).fill(startMins);
    
    const flightNames = [
      { id: 'A', name: 'Pro Flight', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
      { id: 'B', name: 'Amateur Flight', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
      { id: 'C', name: 'Casual Flight', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
      { id: 'D', name: 'Fun Flight', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' }
    ];
    
    const numFlights = numTeams / 4;
    const activeFlights = flightNames.slice(0, numFlights);
    
    const timelineSchedule = [];
    const flightData = [];
    const sfMatches = [];

    // --- PHASE 1: Schedule all Semi-Finals first ---
    for (let f = 0; f < numFlights; f++) {
      const flight = activeFlights[f];
      
      for (let sf = 1; sf <= 2; sf++) {
        const matchId = `SF-${flight.id}${sf}`;
        
        // Find earliest available court
        let bestCourtIdx = 0;
        let earliestStart = Infinity;
        for (let c = 0; c < numCourts; c++) {
          if (courtAvailability[c] < earliestStart) {
            earliestStart = courtAvailability[c];
            bestCourtIdx = c;
          }
        }

        const matchStart = earliestStart;
        const matchEnd = matchStart + matchDuration;
        courtAvailability[bestCourtIdx] = matchEnd;

        const matchObj = {
          id: matchId,
          flightId: flight.id,
          flightName: flight.name,
          color: flight.color,
          bg: flight.bg,
          phase: 'Semi-Final',
          court: bestCourtIdx + 1,
          startMins: matchStart,
          endMins: matchEnd,
          startTimeFormatted: formatTime(matchStart),
          endTimeFormatted: formatTime(matchEnd),
          team1: `${flight.name} Seed ${sf === 1 ? '1' : '2'}`,
          team2: `${flight.name} Seed ${sf === 1 ? '4' : '3'}`
        };

        sfMatches.push(matchObj);
        timelineSchedule.push(matchObj);
      }
    }

    // --- PHASE 2: Schedule all Grand Finals ---
    const finalMatches = [];
    for (let f = 0; f < numFlights; f++) {
      const flight = activeFlights[f];
      
      // Find the specific SFs for this flight to know when they are ready
      const flightSFs = sfMatches.filter(m => m.flightId === flight.id);
      const readyTime = Math.max(flightSFs[0].endMins, flightSFs[1].endMins);

      // Find earliest court that is available AT OR AFTER the teams are ready
      let bestCourtIdx = 0;
      let earliestActualStart = Infinity;
      for (let c = 0; c < numCourts; c++) {
        const potentialStart = Math.max(courtAvailability[c], readyTime);
        if (potentialStart < earliestActualStart) {
          earliestActualStart = potentialStart;
          bestCourtIdx = c;
        }
      }

      const matchStart = earliestActualStart;
      const matchEnd = matchStart + matchDuration;
      courtAvailability[bestCourtIdx] = matchEnd;

      const matchObj = {
        id: `FIN-${flight.id}`,
        flightId: flight.id,
        flightName: flight.name,
        color: flight.color,
        bg: flight.bg,
        phase: 'Flight Final',
        court: bestCourtIdx + 1,
        startMins: matchStart,
        endMins: matchEnd,
        startTimeFormatted: formatTime(matchStart),
        endTimeFormatted: formatTime(matchEnd),
        team1: `{{ Winner SF-${flight.id}1 }}`,
        team2: `{{ Winner SF-${flight.id}2 }}`
      };

      finalMatches.push(matchObj);
      timelineSchedule.push(matchObj);
      
      // Build grouped flight structure for UI
      flightData.push({
        ...flight,
        matches: [...flightSFs, matchObj]
      });
    }

    // Sort timeline chronologically, then by court
    timelineSchedule.sort((a, b) => {
      if (a.startMins !== b.startMins) return a.startMins - b.startMins;
      return a.court - b.court;
    });

    const totalTournamentTime = Math.max(...courtAvailability) - startMins;

    return { flightData, timelineSchedule, totalTournamentTime };
  }, [numTeams, numCourts, matchDuration, startTime]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8 font-sans selection:bg-indigo-200">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Award className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Flighted Quads Simulator
            </h1>
          </div>
          <p className="text-slate-500 max-w-3xl">
            A high-efficiency format that completely bypasses standard bracket bottlenecks. By dividing teams into isolated 4-team tiers (Flights), you can run a complete championship for up to 16 teams simultaneously and finish in just over an hour.
          </p>
        </header>

        {/* Configurations & Math Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="col-span-1 lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex justify-between">
                <span>Total Teams</span>
                <span className="text-indigo-600 font-bold">{numTeams}</span>
              </label>
              <select 
                value={numTeams}
                onChange={(e) => setNumTeams(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
              >
                <option value={12}>12 Teams (3 Flights)</option>
                <option value={16}>16 Teams (4 Flights)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex justify-between">
                <span>Available Courts</span>
                <span className="text-indigo-600 font-bold">{numCourts}</span>
              </label>
              <input 
                type="range" min="2" max="6" step="1"
                value={numCourts} 
                onChange={(e) => setNumCourts(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block mb-2">Match Duration (mins)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <input 
                  type="number" min="10" max="60" step="5"
                  value={matchDuration}
                  onChange={(e) => setMatchDuration(Number(e.target.value))}
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block mb-2">Start Time</label>
              <input 
                type="time" 
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
              />
            </div>
          </div>

          {/* Math Output Panel */}
          <div className="col-span-1 bg-indigo-900 rounded-2xl shadow-sm p-6 text-indigo-50 flex flex-col justify-center">
            <h3 className="text-indigo-300 font-bold tracking-widest text-xs uppercase mb-4">Capacity Mathematics</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-indigo-700 pb-2">
                <span className="text-sm opacity-90">Total Matches Required:</span>
                <span className="text-xl font-bold">{scheduleData.timelineSchedule.length}</span>
              </div>
              <div className="flex justify-between items-end border-b border-indigo-700 pb-2">
                <span className="text-sm opacity-90">Time Limit:</span>
                <span className="text-xl font-bold">100 mins</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm opacity-90">Computed Duration:</span>
                <span className={`text-2xl font-black ${scheduleData.totalTournamentTime <= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {scheduleData.totalTournamentTime} mins
                </span>
              </div>
              {scheduleData.totalTournamentTime <= 100 ? (
                <p className="text-xs text-emerald-300 bg-emerald-900/40 p-2 rounded inline-block mt-2 font-medium">✓ Fits perfectly within constraints</p>
              ) : (
                <p className="text-xs text-rose-300 bg-rose-900/40 p-2 rounded inline-block mt-2 font-medium">⚠️ Exceeds 100-minute time limit</p>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-md mx-auto sm:mx-0">
          <button
            onClick={() => setActiveTab('flights')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'flights' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" /> Bracket View
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'timeline' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CalendarDays className="w-4 h-4" /> Court Timeline
          </button>
        </div>

        {/* Tab 1: Flights View */}
        {activeTab === 'flights' && (
          <div className="animate-in fade-in duration-300">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {scheduleData.flightData.map((flight) => {
                const sfs = flight.matches.filter(m => m.phase === 'Semi-Final');
                const fin = flight.matches.find(m => m.phase === 'Flight Final');
                
                return (
                  <div key={flight.id} className={`bg-white rounded-2xl shadow-sm border ${flight.border} overflow-hidden flex flex-col`}>
                    <div className={`${flight.bg} px-6 py-4 border-b ${flight.border} flex justify-between items-center`}>
                      <h3 className={`font-black text-lg ${flight.color}`}>{flight.name}</h3>
                      <div className="flex gap-2">
                        <Trophy className={`w-5 h-5 ${flight.color} opacity-70`} />
                      </div>
                    </div>
                    
                    <div className="p-6 flex-1 flex flex-row items-center gap-6 relative">
                      {/* Semi-Finals Column */}
                      <div className="flex flex-col gap-6 w-5/12 z-10 relative">
                        {sfs.map((match) => (
                          <div key={match.id} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden relative">
                            <div className="bg-slate-50 px-2 py-1 text-[10px] text-slate-500 font-bold border-b border-slate-100 flex justify-between">
                              <span>{match.id}</span>
                              <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> C{match.court}</span>
                            </div>
                            <div className="flex flex-col">
                              <div className="px-3 py-2 border-b border-slate-100"><span className="text-sm font-semibold text-slate-700">{match.team1}</span></div>
                              <div className="px-3 py-2"><span className="text-sm font-semibold text-slate-700">{match.team2}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Final Column */}
                      <div className="w-5/12 z-10 relative ml-auto">
                        <div className={`bg-white border-2 ${flight.border} rounded-lg shadow-md overflow-hidden relative`}>
                          <div className={`${flight.bg} px-2 py-1.5 text-[10px] ${flight.color} font-bold border-b ${flight.border} flex justify-between uppercase tracking-wider`}>
                            <span>{fin.id} - Grand Final</span>
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> C{fin.court}</span>
                          </div>
                          <div className="flex flex-col">
                            <div className="px-3 py-2.5 border-b border-slate-100"><span className="text-xs font-mono font-bold text-slate-500">{fin.team1}</span></div>
                            <div className="px-3 py-2.5"><span className="text-xs font-mono font-bold text-slate-500">{fin.team2}</span></div>
                          </div>
                        </div>
                      </div>
                      
                      {/* CSS Connecting Lines */}
                      <div className="absolute top-1/2 left-[calc(41.666%+1.5rem)] w-[calc(16.666%-3rem)] h-[110px] -translate-y-1/2 z-0 border-y-2 border-r-2 border-slate-200 rounded-r-xl"></div>
                      <div className="absolute top-1/2 right-[41.666%] w-6 h-[2px] bg-slate-200 z-0"></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Timeline */}
        {activeTab === 'timeline' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-bold">
                    <th className="px-6 py-4">Time Window</th>
                    <th className="px-6 py-4">Court</th>
                    <th className="px-6 py-4">Flight & Phase</th>
                    <th className="px-6 py-4">Matchup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scheduleData.timelineSchedule.map((match) => (
                    <tr key={match.id} className={`hover:bg-slate-50 transition-colors group ${match.phase === 'Flight Final' ? match.bg : ''}`}>
                      <td className="px-6 py-4 font-mono text-sm text-slate-600 whitespace-nowrap">
                        <span className="font-bold text-slate-800">{match.startTimeFormatted}</span>
                        <span className="text-slate-400 mx-2">-</span>
                        <span>{match.endTimeFormatted}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded w-max">
                          <MapPin className="w-4 h-4 text-slate-500" />
                          Court {match.court}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs font-bold ${match.color}`}>
                            {match.flightName}
                          </span>
                          <span className={`text-[10px] uppercase tracking-wider font-bold w-max px-2 py-0.5 rounded ${match.phase === 'Flight Final' ? 'bg-white border border-slate-200' : 'bg-slate-100 text-slate-500'}`}>
                            {match.phase}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm">
                          <span className={`flex-1 font-medium sm:text-right truncate max-w-[200px] ${match.team1.includes('{{') ? 'text-slate-400 font-mono text-xs' : 'text-slate-800'}`}>
                            {match.team1}
                          </span>
                          <span className="text-xs font-black text-slate-300 self-start sm:self-center">VS</span>
                          <span className={`flex-1 font-medium truncate max-w-[200px] ${match.team2.includes('{{') ? 'text-slate-400 font-mono text-xs' : 'text-slate-800'}`}>
                            {match.team2}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}