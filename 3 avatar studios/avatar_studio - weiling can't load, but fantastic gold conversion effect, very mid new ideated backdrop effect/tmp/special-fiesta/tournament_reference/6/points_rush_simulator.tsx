import React, { useState, useMemo } from 'react';
import { Clock, Trophy, MapPin, Grid, CalendarDays, Zap, Users, Swords, ArrowDown, Activity } from 'lucide-react';

const formatTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
};

export default function PointsRushSimulator() {
  const [activeTab, setActiveTab] = useState('topology');
  
  // Fixed parameters for this mathematically precise format
  const numTeams = 12;
  const numCourts = 3;
  const matchDuration = 20;
  const startTimeMins = 9 * 60; // 9:00 AM

  const scheduleData = useMemo(() => {
    // Manually optimized schedule to minimize back-to-back games for 3-team groups
    // while perfectly utilizing 3 courts over 4 time slots.
    const matches = [
      // Slot 1 (0-20 mins)
      { id: 'GA-1', phase: 'Group A', team1: 'Team A1', team2: 'Team A2', court: 1, startMins: startTimeMins, endMins: startTimeMins + 20, type: 'group' },
      { id: 'GB-1', phase: 'Group B', team1: 'Team B1', team2: 'Team B2', court: 2, startMins: startTimeMins, endMins: startTimeMins + 20, type: 'group' },
      { id: 'GC-1', phase: 'Group C', team1: 'Team C1', team2: 'Team C2', court: 3, startMins: startTimeMins, endMins: startTimeMins + 20, type: 'group' },
      
      // Slot 2 (20-40 mins)
      { id: 'GD-1', phase: 'Group D', team1: 'Team D1', team2: 'Team D2', court: 1, startMins: startTimeMins + 20, endMins: startTimeMins + 40, type: 'group' },
      { id: 'GA-2', phase: 'Group A', team1: 'Team A3', team2: 'Team A1', court: 2, startMins: startTimeMins + 20, endMins: startTimeMins + 40, type: 'group' },
      { id: 'GB-2', phase: 'Group B', team1: 'Team B3', team2: 'Team B1', court: 3, startMins: startTimeMins + 20, endMins: startTimeMins + 40, type: 'group' },
      
      // Slot 3 (40-60 mins)
      { id: 'GC-2', phase: 'Group C', team1: 'Team C3', team2: 'Team C1', court: 1, startMins: startTimeMins + 40, endMins: startTimeMins + 60, type: 'group' },
      { id: 'GD-2', phase: 'Group D', team1: 'Team D3', team2: 'Team D1', court: 2, startMins: startTimeMins + 40, endMins: startTimeMins + 60, type: 'group' },
      { id: 'GA-3', phase: 'Group A', team1: 'Team A2', team2: 'Team A3', court: 3, startMins: startTimeMins + 40, endMins: startTimeMins + 60, type: 'group' },
      
      // Slot 4 (60-80 mins)
      { id: 'GB-3', phase: 'Group B', team1: 'Team B2', team2: 'Team B3', court: 1, startMins: startTimeMins + 60, endMins: startTimeMins + 80, type: 'group' },
      { id: 'GC-3', phase: 'Group C', team1: 'Team C2', team2: 'Team C3', court: 2, startMins: startTimeMins + 60, endMins: startTimeMins + 80, type: 'group' },
      { id: 'GD-3', phase: 'Group D', team1: 'Team D2', team2: 'Team D3', court: 3, startMins: startTimeMins + 60, endMins: startTimeMins + 80, type: 'group' },
      
      // Slot 5 (80-100 mins) - The Grand Final
      // Center court (Court 2) is used, courts 1 & 3 are empty to draw all attention to the final.
      { id: 'GF', phase: 'Grand Final', team1: '#1 Overall Leaderboard', team2: '#2 Overall Leaderboard', court: 2, startMins: startTimeMins + 80, endMins: startTimeMins + 100, type: 'championship' },
    ];

    const timeline = matches.map(m => ({
      ...m,
      startTimeFormatted: formatTime(m.startMins),
      endTimeFormatted: formatTime(m.endMins),
      bgColor: m.type === 'championship' ? 'bg-amber-50' : 'bg-white',
      borderColor: m.type === 'championship' ? 'border-amber-400' : 'border-indigo-200',
      textColor: m.type === 'championship' ? 'text-amber-800' : 'text-indigo-800'
    }));

    return { timeline, totalTime: 100 };
  }, []);

  const renderGroupCard = (groupName, teams) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col z-10 w-full max-w-[220px]">
      <div className="bg-slate-100 border-b border-slate-200 px-3 py-2 flex justify-between items-center">
        <span className="font-bold text-slate-700 text-sm">{groupName}</span>
        <span className="text-[10px] font-black uppercase text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">3 Teams</span>
      </div>
      <div className="p-3 space-y-1.5 bg-white flex-1">
        {teams.map((team, idx) => (
          <div key={idx} className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 flex justify-between">
            <span>{team}</span>
            <span className="text-slate-300">0-0</span>
          </div>
        ))}
      </div>
      <div className="bg-indigo-50 border-t border-indigo-100 px-3 py-2 text-[10px] font-bold text-indigo-600 text-center uppercase tracking-wider">
        Winner advances to Leaderboard
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8 font-sans selection:bg-indigo-200">
      <div className="max-w-[1200px] mx-auto space-y-6">
        
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              The "Points-Rush" Format
            </h1>
          </div>
          <p className="text-slate-500 max-w-3xl">
            A high-intensity hybrid tournament for 12 teams. Teams battle through rapid-fire group stages, but winning the group isn't enough. Only the top two group winners with the highest overall points bypass the semi-finals to clash in a singular Grand Final. 
          </p>
        </header>

        {/* Math Constraints Panel */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teams</span>
            <span className="text-2xl font-black text-slate-800">12</span>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Available Courts</span>
            <span className="text-2xl font-black text-slate-800">3</span>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Match Duration</span>
            <span className="text-2xl font-black text-slate-800">20 mins</span>
          </div>
          <div className="bg-indigo-900 p-4 rounded-xl shadow-sm border border-indigo-800 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 opacity-10"><Clock className="w-24 h-24 text-white"/></div>
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider z-10">Total Time Required</span>
            <span className="text-2xl font-black text-emerald-400 z-10">100 mins</span>
            <span className="text-[10px] text-indigo-200 font-medium z-10 mt-1">Perfect fit for 5 time slots</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-sm">
          <button
            onClick={() => setActiveTab('topology')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'topology' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" /> Group Topology
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'timeline' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CalendarDays className="w-4 h-4" /> Court Timeline
          </button>
        </div>

        {activeTab === 'topology' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 overflow-hidden relative flex flex-col items-center animate-in fade-in duration-300">
            
            <h3 className="text-lg font-bold text-slate-800 self-start mb-8 flex items-center gap-2">
              <Swords className="w-5 h-5 text-indigo-500" /> Phase 1: The Group Stage
            </h3>

            {/* The 4 Groups */}
            <div className="flex flex-wrap justify-center gap-6 w-full relative z-10">
              {renderGroupCard('Group A', ['Team A1', 'Team A2', 'Team A3'])}
              {renderGroupCard('Group B', ['Team B1', 'Team B2', 'Team B3'])}
              {renderGroupCard('Group C', ['Team C1', 'Team C2', 'Team C3'])}
              {renderGroupCard('Group D', ['Team D1', 'Team D2', 'Team D3'])}
            </div>

            {/* Downward Funnel */}
            <div className="flex justify-center w-full mt-8 mb-4 relative">
              <div className="absolute border-t-2 border-l-2 border-r-2 border-dashed border-slate-300 w-[60%] h-8 -top-8 rounded-t-xl"></div>
              <ArrowDown className="w-8 h-8 text-slate-400" />
            </div>

            {/* Phase 2: The Global Leaderboard */}
            <div className="w-full max-w-2xl bg-slate-800 rounded-xl p-6 shadow-md border border-slate-700 mb-8 z-10 relative">
              <h3 className="text-white font-bold text-center flex justify-center items-center gap-2 mb-4">
                <Grid className="w-5 h-5 text-indigo-400" /> Phase 2: Global Points Leaderboard
              </h3>
              <p className="text-slate-400 text-sm text-center mb-4 max-w-lg mx-auto">
                All 4 Group Winners are pooled here. They are ranked by Points, Goal Differential, and Goals Scored. <span className="text-indigo-300 font-bold">Only the absolute Top 2 advance.</span>
              </p>
              
              <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
                <div className="grid grid-cols-5 px-4 py-2 bg-slate-800 border-b border-slate-700 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <div className="col-span-2">Group Winner</div>
                  <div className="text-center">PTS</div>
                  <div className="text-center">DIFF</div>
                  <div className="text-center">Status</div>
                </div>
                <div className="grid grid-cols-5 px-4 py-3 items-center border-b border-slate-800 bg-indigo-900/40">
                  <div className="col-span-2 text-sm font-bold text-white flex items-center gap-2"><span className="text-indigo-400">#1</span> Winner Group C</div>
                  <div className="text-center text-sm font-bold text-emerald-400">9</div>
                  <div className="text-center text-sm font-medium text-slate-300">+12</div>
                  <div className="text-center text-xs font-black text-indigo-300 uppercase tracking-wider">Advances</div>
                </div>
                <div className="grid grid-cols-5 px-4 py-3 items-center border-b border-slate-800 bg-indigo-900/40">
                  <div className="col-span-2 text-sm font-bold text-white flex items-center gap-2"><span className="text-indigo-400">#2</span> Winner Group A</div>
                  <div className="text-center text-sm font-bold text-emerald-400">9</div>
                  <div className="text-center text-sm font-medium text-slate-300">+7</div>
                  <div className="text-center text-xs font-black text-indigo-300 uppercase tracking-wider">Advances</div>
                </div>
                <div className="grid grid-cols-5 px-4 py-3 items-center border-b border-slate-800 opacity-50">
                  <div className="col-span-2 text-sm font-bold text-slate-400 flex items-center gap-2"><span className="text-slate-600">#3</span> Winner Group D</div>
                  <div className="text-center text-sm font-bold text-slate-400">7</div>
                  <div className="text-center text-sm font-medium text-slate-500">+4</div>
                  <div className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Eliminated</div>
                </div>
                <div className="grid grid-cols-5 px-4 py-3 items-center opacity-50">
                  <div className="col-span-2 text-sm font-bold text-slate-400 flex items-center gap-2"><span className="text-slate-600">#4</span> Winner Group B</div>
                  <div className="text-center text-sm font-bold text-slate-400">6</div>
                  <div className="text-center text-sm font-medium text-slate-500">+1</div>
                  <div className="text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Eliminated</div>
                </div>
              </div>
            </div>

            {/* Funnel to Final */}
            <div className="flex justify-center w-full mb-4 relative z-0">
              <ArrowDown className="w-8 h-8 text-amber-400" />
            </div>

            {/* The Grand Final */}
            <div className="bg-gradient-to-br from-amber-100 to-amber-50 rounded-xl shadow-md border-2 border-amber-400 p-6 w-full max-w-sm relative overflow-hidden z-10 text-center flex flex-col items-center">
              <div className="absolute top-0 right-0 p-4 opacity-20"><Trophy className="w-24 h-24 text-amber-500"/></div>
              <h3 className="text-amber-800 font-black text-xl mb-4 relative z-10 uppercase tracking-widest flex items-center gap-2">
                <Trophy className="w-5 h-5"/> Grand Final
              </h3>
              <div className="flex items-center justify-between w-full bg-white rounded-lg p-3 shadow-sm border border-amber-200 relative z-10">
                <span className="font-bold text-slate-700">#1 Overall</span>
                <span className="text-xs font-black text-slate-300 bg-slate-100 px-2 py-1 rounded">VS</span>
                <span className="font-bold text-slate-700">#2 Overall</span>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">Time Window</th>
                    <th className="px-6 py-4 font-bold">Court</th>
                    <th className="px-6 py-4 font-bold">Match ID</th>
                    <th className="px-6 py-4 font-bold">Matchup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scheduleData.timeline.map((match) => (
                    <tr key={match.id} className={`transition-colors ${match.type === 'championship' ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50'}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                          <Clock className={`w-4 h-4 ${match.type === 'championship' ? 'text-amber-500' : 'text-indigo-400'}`} />
                          {match.startTimeFormatted} - {match.endTimeFormatted}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          match.court === 2 && match.type === 'championship' 
                            ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' 
                            : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          <MapPin className="w-3.5 h-3.5" />
                          {match.court === 2 && match.type === 'championship' ? 'Center Court (2)' : `Court ${match.court}`}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs font-bold ${match.textColor} uppercase`}>
                            {match.id}
                          </span>
                          <span className={`text-[10px] uppercase tracking-wider font-bold w-max px-2 py-0.5 rounded ${
                            match.type === 'championship' ? 'bg-amber-200/50 text-amber-700' : 'bg-black/5 text-slate-600'
                          }`}>
                            {match.phase}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 text-sm">
                          <span className={`flex-1 font-medium text-right truncate w-[140px] ${match.team1.includes('#') ? 'text-slate-500 font-bold' : 'text-slate-800'}`}>
                            {match.team1}
                          </span>
                          <span className="text-[10px] font-black text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded">VS</span>
                          <span className={`flex-1 font-medium truncate w-[140px] ${match.team2.includes('#') ? 'text-slate-500 font-bold' : 'text-slate-800'}`}>
                            {match.team2}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 border-t border-slate-200 p-4 text-center">
              <p className="text-sm text-slate-500">
                <span className="font-bold text-slate-700">Notice:</span> The schedule perfectly utilizes all 3 courts for the first 80 minutes. During the 80-100 minute window, Courts 1 and 3 are intentionally left empty so the entire facility can watch the Grand Final on Center Court.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}