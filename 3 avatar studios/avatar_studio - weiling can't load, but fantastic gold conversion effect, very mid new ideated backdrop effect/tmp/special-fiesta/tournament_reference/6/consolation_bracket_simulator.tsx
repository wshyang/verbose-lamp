import React, { useState, useMemo } from 'react';
import { Clock, Trophy, MapPin, Grid, CalendarDays, Award, Medal, ShieldAlert } from 'lucide-react';

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

export default function ConsolationBracketSimulator() {
  const [activeTab, setActiveTab] = useState('bracket'); // 'bracket' or 'timeline'
  const [numCourts, setNumCourts] = useState(3);
  const [matchDuration, setMatchDuration] = useState(20);
  const [startTime, setStartTime] = useState('09:00');

  const scheduleData = useMemo(() => {
    const startMins = parseTime(startTime);
    let courtAvailability = Array(numCourts).fill(startMins);
    
    // Define the 10 specific matches for an 8-team guaranteed-2-game format
    const matchesToSchedule = [
      { id: 'QF1', phase: 'Quarterfinal', team1: 'Seed 1', team2: 'Seed 8', deps: [], type: 'main' },
      { id: 'QF2', phase: 'Quarterfinal', team1: 'Seed 4', team2: 'Seed 5', deps: [], type: 'main' },
      { id: 'QF3', phase: 'Quarterfinal', team1: 'Seed 3', team2: 'Seed 6', deps: [], type: 'main' },
      { id: 'QF4', phase: 'Quarterfinal', team1: 'Seed 2', team2: 'Seed 7', deps: [], type: 'main' },
      
      { id: 'SF1', phase: 'Semi-Final', team1: 'Winner QF1', team2: 'Winner QF2', deps: ['QF1', 'QF2'], type: 'main' },
      { id: 'SF2', phase: 'Semi-Final', team1: 'Winner QF3', team2: 'Winner QF4', deps: ['QF3', 'QF4'], type: 'main' },
      
      { id: 'CON1', phase: 'Consolation', team1: 'Loser QF1', team2: 'Loser QF2', deps: ['QF1', 'QF2'], type: 'consolation' },
      { id: 'CON2', phase: 'Consolation', team1: 'Loser QF3', team2: 'Loser QF4', deps: ['QF3', 'QF4'], type: 'consolation' },
      
      { id: 'GF', phase: 'Grand Final', team1: 'Winner SF1', team2: 'Winner SF2', deps: ['SF1', 'SF2'], type: 'championship' },
      { id: '3RD', phase: '3rd Place Match', team1: 'Loser SF1', team2: 'Loser SF2', deps: ['SF1', 'SF2'], type: 'placement' },
    ];

    const scheduledMatches = [];
    const completedMatchTimes = {};
    const pendingMatches = [...matchesToSchedule];

    // Intelligent Scheduling Algorithm (Dependency-Aware)
    while (pendingMatches.length > 0) {
      // Find matches where all prerequisite dependencies have finished
      const readyMatches = pendingMatches.filter(m => 
        m.deps.every(dep => completedMatchTimes[dep] !== undefined)
      );

      // Failsafe to prevent infinite loops if dependencies are broken
      if (readyMatches.length === 0) break; 

      // Sort ready matches to prioritize Main Bracket over Consolation, and QFs over SFs
      readyMatches.sort((a, b) => {
        const typePriority = { main: 1, championship: 2, placement: 3, consolation: 4 };
        return typePriority[a.type] - typePriority[b.type];
      });

      const match = readyMatches[0];
      
      // Calculate when the teams for this match are actually ready to play
      let teamsReadyTime = startMins;
      if (match.deps.length > 0) {
        teamsReadyTime = Math.max(...match.deps.map(dep => completedMatchTimes[dep]));
      }

      // Find the earliest available court AT OR AFTER the teams are ready
      let bestCourtIdx = 0;
      let earliestActualStart = Infinity;
      for (let c = 0; c < numCourts; c++) {
        const potentialStart = Math.max(courtAvailability[c], teamsReadyTime);
        if (potentialStart < earliestActualStart) {
          earliestActualStart = potentialStart;
          bestCourtIdx = c;
        }
      }

      const matchStart = earliestActualStart;
      const matchEnd = matchStart + matchDuration;
      
      courtAvailability[bestCourtIdx] = matchEnd;
      completedMatchTimes[match.id] = matchEnd;

      scheduledMatches.push({
        ...match,
        court: bestCourtIdx + 1,
        startMins: matchStart,
        endMins: matchEnd,
        startTimeFormatted: formatTime(matchStart),
        endTimeFormatted: formatTime(matchEnd),
        bgColor: match.type === 'championship' ? 'bg-amber-50' : 
                 match.type === 'placement' ? 'bg-orange-50' : 
                 match.type === 'consolation' ? 'bg-slate-100' : 'bg-white',
        borderColor: match.type === 'championship' ? 'border-amber-300' : 
                     match.type === 'placement' ? 'border-orange-300' : 
                     match.type === 'consolation' ? 'border-slate-300' : 'border-indigo-200',
        textColor: match.type === 'championship' ? 'text-amber-800' : 
                   match.type === 'placement' ? 'text-orange-800' : 
                   match.type === 'consolation' ? 'text-slate-600' : 'text-indigo-800'
      });

      // Remove scheduled match from pending list
      const index = pendingMatches.findIndex(m => m.id === match.id);
      pendingMatches.splice(index, 1);
    }

    // Sort the final timeline chronologically for the table view
    const timeline = [...scheduledMatches].sort((a, b) => {
      if (a.startMins !== b.startMins) return a.startMins - b.startMins;
      return a.court - b.court;
    });

    const totalTournamentTime = Math.max(...courtAvailability) - startMins;

    return { timeline, scheduledMatches, totalTournamentTime };
  }, [numCourts, matchDuration, startTime]);

  // Helper function to render a match card in the bracket view
  const renderMatchCard = (matchId) => {
    const match = scheduleData.scheduledMatches.find(m => m.id === matchId);
    if (!match) return null;

    return (
      <div className={`relative rounded-xl border-2 ${match.borderColor} ${match.bgColor} shadow-sm overflow-hidden w-full max-w-[220px] transition-transform hover:scale-105 z-10`}>
        <div className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex justify-between border-b ${match.borderColor} ${match.textColor}`}>
          <span>{match.id} - {match.phase}</span>
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> C{match.court}</span>
        </div>
        <div className="flex flex-col">
          <div className="px-3 py-2 border-b border-black/5"><span className="text-xs font-semibold text-slate-800">{match.team1}</span></div>
          <div className="px-3 py-2"><span className="text-xs font-semibold text-slate-800">{match.team2}</span></div>
        </div>
        <div className="absolute bottom-0 right-0 bg-black/5 text-[9px] px-2 py-1 font-mono text-slate-600 rounded-tl-lg">
          {match.startTimeFormatted}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8 font-sans selection:bg-indigo-200">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <ShieldAlert className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Consolation Bracket Simulator (8 Teams)
            </h1>
          </div>
          <p className="text-slate-500 max-w-3xl">
            A format ensuring a minimum of two matches per team. Winners of Round 1 advance to the Championship Semi-Finals, while the losers drop down to play a simultaneous Consolation match, maximizing court usage and participant engagement.
          </p>
        </header>

        {/* Configurations & Math Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="col-span-1 lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block mb-2">Available Courts</label>
              <input 
                type="range" min="2" max="4" step="1"
                value={numCourts} 
                onChange={(e) => setNumCourts(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2"
              />
              <div className="text-right text-sm font-bold text-indigo-600">{numCourts} Courts</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block mb-2">Match Duration (mins)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <input 
                  type="number" min="10" max="45" step="5"
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
            <h3 className="text-indigo-300 font-bold tracking-widest text-xs uppercase mb-4">Time Constraints</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-indigo-700 pb-2">
                <span className="text-sm opacity-90">Total Matches:</span>
                <span className="text-xl font-bold">10</span>
              </div>
              <div className="flex justify-between items-end border-b border-indigo-700 pb-2">
                <span className="text-sm opacity-90">Target Limit:</span>
                <span className="text-xl font-bold">100 mins</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm opacity-90">Computed Duration:</span>
                <span className={`text-2xl font-black ${scheduleData.totalTournamentTime <= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {scheduleData.totalTournamentTime} mins
                </span>
              </div>
              {scheduleData.totalTournamentTime <= 100 ? (
                <p className="text-xs text-emerald-300 bg-emerald-900/40 p-2 rounded inline-block mt-2 font-medium">✓ Fits perfectly within 100 minutes</p>
              ) : (
                <p className="text-xs text-rose-300 bg-rose-900/40 p-2 rounded inline-block mt-2 font-medium">⚠️ Exceeds 100-minute time limit</p>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-md mx-auto sm:mx-0">
          <button
            onClick={() => setActiveTab('bracket')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'bracket' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" /> Bracket Topology
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

        {/* Tab 1: Bracket View */}
        {activeTab === 'bracket' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Main Championship Bracket */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 overflow-x-auto">
              <div className="flex items-center gap-2 mb-6">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h2 className="text-xl font-bold text-slate-800">Championship Path</h2>
              </div>
              
              <div className="flex min-w-[750px] items-center">
                {/* Round 1 (QFs) */}
                <div className="flex flex-col gap-6 w-1/3 relative">
                  {renderMatchCard('QF1')}
                  {renderMatchCard('QF2')}
                  {renderMatchCard('QF3')}
                  {renderMatchCard('QF4')}
                </div>

                {/* Connectors to SF */}
                <div className="w-12 h-[350px] relative">
                  <div className="absolute top-[12.5%] right-0 w-full h-[25%] border-t-2 border-r-2 border-b-2 border-slate-200 rounded-r-xl"></div>
                  <div className="absolute bottom-[12.5%] right-0 w-full h-[25%] border-t-2 border-r-2 border-b-2 border-slate-200 rounded-r-xl"></div>
                </div>

                {/* Round 2 (SFs) */}
                <div className="flex flex-col gap-[90px] w-1/3 relative z-10 px-4">
                  {renderMatchCard('SF1')}
                  {renderMatchCard('SF2')}
                </div>

                {/* Connectors to GF */}
                <div className="w-12 h-[200px] relative">
                  <div className="absolute top-[25%] right-0 w-full h-[50%] border-t-2 border-r-2 border-b-2 border-slate-200 rounded-r-xl"></div>
                </div>

                {/* Round 3 (Grand Final) */}
                <div className="flex flex-col justify-center w-1/3 relative z-10 pl-4">
                  {renderMatchCard('GF')}
                </div>
              </div>
            </div>

            {/* Consolation & Placements */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Consolation Bracket */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-x-auto">
                <div className="flex items-center gap-2 mb-6">
                  <ShieldAlert className="w-5 h-5 text-slate-500" />
                  <h2 className="text-lg font-bold text-slate-800">Consolation (Round 1 Losers)</h2>
                </div>
                <div className="flex flex-col gap-6 w-full max-w-[250px]">
                  {renderMatchCard('CON1')}
                  {renderMatchCard('CON2')}
                </div>
              </div>

              {/* 3rd Place Match */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-x-auto">
                <div className="flex items-center gap-2 mb-6">
                  <Medal className="w-5 h-5 text-orange-500" />
                  <h2 className="text-lg font-bold text-slate-800">Third-Place Match</h2>
                </div>
                <div className="flex flex-col gap-6 w-full max-w-[250px]">
                  {renderMatchCard('3RD')}
                </div>
              </div>
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
                    <th className="px-6 py-4">Bracket & Phase</th>
                    <th className="px-6 py-4">Matchup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scheduleData.timeline.map((match) => (
                    <tr key={match.id} className={`hover:bg-slate-50 transition-colors ${match.bgColor}`}>
                      <td className="px-6 py-4 font-mono text-sm text-slate-600 whitespace-nowrap">
                        <span className="font-bold text-slate-800">{match.startTimeFormatted}</span>
                        <span className="text-slate-400 mx-2">-</span>
                        <span>{match.endTimeFormatted}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 bg-white/50 border border-slate-200 px-2 py-1 rounded w-max">
                          <MapPin className="w-4 h-4 text-slate-500" />
                          Court {match.court}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs font-bold ${match.textColor} uppercase`}>
                            {match.id}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider font-bold w-max px-2 py-0.5 rounded bg-black/5 text-slate-600">
                            {match.phase}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm">
                          <span className={`flex-1 font-medium sm:text-right truncate max-w-[200px] ${match.team1.includes('Winner') || match.team1.includes('Loser') ? 'text-slate-400 font-mono text-xs' : 'text-slate-800'}`}>
                            {match.team1}
                          </span>
                          <span className="text-xs font-black text-slate-300 self-start sm:self-center">VS</span>
                          <span className={`flex-1 font-medium truncate max-w-[200px] ${match.team2.includes('Winner') || match.team2.includes('Loser') ? 'text-slate-400 font-mono text-xs' : 'text-slate-800'}`}>
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