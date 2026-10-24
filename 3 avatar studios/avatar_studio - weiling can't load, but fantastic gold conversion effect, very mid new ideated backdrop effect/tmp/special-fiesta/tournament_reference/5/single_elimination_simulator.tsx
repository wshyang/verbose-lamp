import React, { useState, useMemo } from 'react';
import { Clock, Trophy, MapPin, Grid, CalendarDays, Zap, Users } from 'lucide-react';

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

export default function SingleEliminationSimulator() {
  const [activeTab, setActiveTab] = useState('bracket');
  const [numCourts, setNumCourts] = useState(3);
  const [matchDuration, setMatchDuration] = useState(20);
  const [startTime, setStartTime] = useState('09:00');
  const [numTeams, setNumTeams] = useState(11);

  const scheduleData = useMemo(() => {
    const startMins = parseTime(startTime);
    let courtAvailability = Array(numCourts).fill(startMins);
    
    // Dynamic Match Generation based on number of teams (8 to 12)
    const r1Matches = [];
    
    let qf1Team2 = 'Seed 8';
    if (numTeams >= 9) {
      r1Matches.push({ id: 'R1-M1', phase: 'Round 1', team1: 'Seed 8', team2: 'Seed 9', deps: [], type: 'main' });
      qf1Team2 = 'Winner R1-M1';
    }
    
    let qf2Team2 = 'Seed 5';
    if (numTeams >= 12) {
      r1Matches.push({ id: 'R1-M4', phase: 'Round 1', team1: 'Seed 5', team2: 'Seed 12', deps: [], type: 'main' });
      qf2Team2 = 'Winner R1-M4';
    }

    let qf3Team2 = 'Seed 7';
    if (numTeams >= 10) {
      r1Matches.push({ id: 'R1-M2', phase: 'Round 1', team1: 'Seed 7', team2: 'Seed 10', deps: [], type: 'main' });
      qf3Team2 = 'Winner R1-M2';
    }

    let qf4Team2 = 'Seed 6';
    if (numTeams >= 11) {
      r1Matches.push({ id: 'R1-M3', phase: 'Round 1', team1: 'Seed 6', team2: 'Seed 11', deps: [], type: 'main' });
      qf4Team2 = 'Winner R1-M3';
    }

    // The core 8-team base bracket (Quarterfinals -> Grand Final)
    const matches = [
      { id: 'QF1', phase: 'Quarterfinal', team1: 'Seed 1', team2: qf1Team2, deps: numTeams >= 9 ? ['R1-M1'] : [], type: 'main' },
      { id: 'QF2', phase: 'Quarterfinal', team1: 'Seed 4', team2: qf2Team2, deps: numTeams >= 12 ? ['R1-M4'] : [], type: 'main' },
      { id: 'QF3', phase: 'Quarterfinal', team1: 'Seed 2', team2: qf3Team2, deps: numTeams >= 10 ? ['R1-M2'] : [], type: 'main' },
      { id: 'QF4', phase: 'Quarterfinal', team1: 'Seed 3', team2: qf4Team2, deps: numTeams >= 11 ? ['R1-M3'] : [], type: 'main' },
      
      { id: 'SF1', phase: 'Semi-Final', team1: 'Winner QF1', team2: 'Winner QF2', deps: ['QF1', 'QF2'], type: 'main' },
      { id: 'SF2', phase: 'Semi-Final', team1: 'Winner QF3', team2: 'Winner QF4', deps: ['QF3', 'QF4'], type: 'main' },
      
      { id: 'GF', phase: 'Grand Final', team1: 'Winner SF1', team2: 'Winner SF2', deps: ['SF1', 'SF2'], type: 'championship' },
    ];

    const pendingMatches = [...r1Matches, ...matches];
    const scheduledMatches = [];
    const completedMatchTimes = {};

    while (pendingMatches.length > 0) {
      // Find matches where all prerequisites are finished
      const readyMatches = pendingMatches.filter(m => 
        m.deps.every(dep => completedMatchTimes[dep] !== undefined)
      );

      if (readyMatches.length === 0) break; 

      // Sort prioritizing earlier rounds to prevent logic bottlenecks
      readyMatches.sort((a, b) => {
        const priority = { 'Round 1': 1, 'Quarterfinal': 2, 'Semi-Final': 3, 'Grand Final': 4 };
        return priority[a.phase] - priority[b.phase];
      });

      const match = readyMatches[0];
      
      // Calculate earliest time teams are off the court
      let teamsReadyTime = startMins;
      if (match.deps.length > 0) {
        teamsReadyTime = Math.max(...match.deps.map(dep => completedMatchTimes[dep]));
      }

      // Find best available court
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
        bgColor: match.type === 'championship' ? 'bg-amber-50' : 'bg-white',
        borderColor: match.type === 'championship' ? 'border-amber-300' : 'border-indigo-200',
        textColor: match.type === 'championship' ? 'text-amber-800' : 'text-indigo-800'
      });

      const index = pendingMatches.findIndex(m => m.id === match.id);
      pendingMatches.splice(index, 1);
    }

    const timeline = [...scheduledMatches].sort((a, b) => {
      if (a.startMins !== b.startMins) return a.startMins - b.startMins;
      return a.court - b.court;
    });

    const totalTournamentTime = Math.max(...courtAvailability) - startMins;

    return { timeline, scheduledMatches, totalTournamentTime };
  }, [numCourts, matchDuration, startTime, numTeams]);

  // A helper function to render an individual match card
  const renderMatchCard = (matchId) => {
    const match = scheduleData.scheduledMatches.find(m => m.id === matchId);
    if (!match) {
      return (
        <div className="w-[200px] h-[88px] flex flex-col justify-center opacity-40">
          <div className="text-xs text-slate-400 font-medium text-center bg-slate-100 rounded border border-slate-200 py-2 border-dashed">
            BYE (Top Seed Advances)
          </div>
        </div>
      );
    }

    return (
      <div className={`relative rounded-xl border-2 ${match.borderColor} ${match.bgColor} shadow-sm overflow-hidden w-[200px] h-[88px] transition-all hover:border-indigo-400 hover:shadow-md z-10 flex flex-col`}>
        <div className={`px-2 py-1 text-[9px] font-black uppercase tracking-wider flex justify-between border-b ${match.borderColor} ${match.textColor} bg-white/50`}>
          <span>{match.id}</span>
          <span className="flex items-center gap-1 opacity-70"><MapPin className="w-2.5 h-2.5"/> C{match.court} • {match.startTimeFormatted}</span>
        </div>
        <div className="flex flex-col flex-1">
          <div className="px-3 py-1.5 border-b border-black/5 flex-1 flex items-center bg-white/40"><span className="text-xs font-semibold text-slate-700 truncate">{match.team1}</span></div>
          <div className="px-3 py-1.5 flex-1 flex items-center bg-black/5"><span className="text-xs font-semibold text-slate-700 truncate">{match.team2}</span></div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8 font-sans selection:bg-indigo-200">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Single Elimination Simulator
            </h1>
          </div>
          <p className="text-slate-500 max-w-3xl">
            A standard knockout format perfect for crowning a single true champion. Adjust the team count to see how "Byes" are mathematically distributed to top seeds in Round 1 to ensure a perfectly symmetrical Quarterfinal bracket.
          </p>
        </header>

        {/* Configuration Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          <div className="col-span-1 lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2 col-span-1 sm:col-span-2 lg:col-span-1">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2"><Users className="w-4 h-4"/> Teams</label>
              <input 
                type="range" min="8" max="12" step="1"
                value={numTeams} 
                onChange={(e) => setNumTeams(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2"
              />
              <div className="text-right text-sm font-bold text-indigo-600">{numTeams} Teams</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block mb-2">Courts</label>
              <input 
                type="range" min="2" max="4" step="1"
                value={numCourts} 
                onChange={(e) => setNumCourts(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2"
              />
              <div className="text-right text-sm font-bold text-indigo-600">{numCourts} Courts</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block mb-2">Duration (mins)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" min="10" max="45" step="5"
                  value={matchDuration}
                  onChange={(e) => setMatchDuration(Number(e.target.value))}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block mb-2">Start Time</label>
              <input 
                type="time" 
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
              />
            </div>
          </div>

          <div className="col-span-1 bg-indigo-900 rounded-2xl shadow-sm p-6 text-indigo-50 flex flex-col justify-center">
            <h3 className="text-indigo-300 font-bold tracking-widest text-xs uppercase mb-3">Constraints</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-end border-b border-indigo-800 pb-2">
                <span className="text-sm opacity-90">Total Matches:</span>
                <span className="text-lg font-bold">{scheduleData.scheduledMatches.length}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm opacity-90">Total Duration:</span>
                <span className={`text-2xl font-black ${scheduleData.totalTournamentTime <= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {scheduleData.totalTournamentTime} mins
                </span>
              </div>
              {scheduleData.totalTournamentTime <= 100 ? (
                <p className="text-xs text-emerald-300 bg-emerald-900/40 p-1.5 rounded inline-block mt-1 font-medium">✓ Under 100 min limit</p>
              ) : (
                <p className="text-xs text-rose-300 bg-rose-900/40 p-1.5 rounded inline-block mt-1 font-medium">⚠️ Exceeds 100 min limit</p>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-sm">
          <button
            onClick={() => setActiveTab('bracket')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'bracket' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" /> Bracket Topology
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

        {/* BRACKET VIEW */}
        {activeTab === 'bracket' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 overflow-x-auto animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-8">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-slate-800">Championship Path</h2>
            </div>
            
            <div className="flex min-w-max pb-8 pl-4">
              <div className="flex items-center gap-0">
                {/* Left Side: Semi Finals and earlier */}
                <div className="flex flex-col gap-8">
                  
                  {/* Top Tree - SF1 Branch */}
                  <div className="flex items-center gap-0">
                    <div className="flex flex-col gap-4">
                      
                      {/* QF1 Node */}
                      <div className="flex items-center gap-0">
                        <div className="flex flex-col gap-2">
                           <div className="flex items-center h-[88px]">
                             <div className="w-[200px]">
                               {numTeams >= 9 ? renderMatchCard('R1-M1') : renderMatchCard('NULL_MATCH')}
                             </div>
                             <div className={`w-8 border-b-2 border-slate-300 ${numTeams >= 9 ? '' : 'opacity-0'}`}></div>
                           </div>
                        </div>
                        {renderMatchCard('QF1')}
                      </div>

                      {/* QF2 Node */}
                      <div className="flex items-center gap-0">
                        <div className="flex flex-col gap-2">
                           <div className="flex items-center h-[88px]">
                             <div className="w-[200px]">
                               {numTeams >= 12 ? renderMatchCard('R1-M4') : renderMatchCard('NULL_MATCH')}
                             </div>
                             <div className={`w-8 border-b-2 border-slate-300 ${numTeams >= 12 ? '' : 'opacity-0'}`}></div>
                           </div>
                        </div>
                        {renderMatchCard('QF2')}
                      </div>

                    </div>

                    {/* Connector SF1 */}
                    <div className="flex items-center w-12">
                      <div className="w-1/2 border-r-2 border-y-2 border-slate-300 rounded-r-xl h-[104px]"></div>
                      <div className="w-1/2 border-b-2 border-slate-300"></div>
                    </div>
                    {renderMatchCard('SF1')}
                  </div>

                  {/* Bottom Tree - SF2 Branch */}
                  <div className="flex items-center gap-0">
                    <div className="flex flex-col gap-4">
                      
                      {/* QF3 Node */}
                      <div className="flex items-center gap-0">
                        <div className="flex flex-col gap-2">
                           <div className="flex items-center h-[88px]">
                             <div className="w-[200px]">
                               {numTeams >= 10 ? renderMatchCard('R1-M2') : renderMatchCard('NULL_MATCH')}
                             </div>
                             <div className={`w-8 border-b-2 border-slate-300 ${numTeams >= 10 ? '' : 'opacity-0'}`}></div>
                           </div>
                        </div>
                        {renderMatchCard('QF3')}
                      </div>

                      {/* QF4 Node */}
                      <div className="flex items-center gap-0">
                        <div className="flex flex-col gap-2">
                           <div className="flex items-center h-[88px]">
                             <div className="w-[200px]">
                               {numTeams >= 11 ? renderMatchCard('R1-M3') : renderMatchCard('NULL_MATCH')}
                             </div>
                             <div className={`w-8 border-b-2 border-slate-300 ${numTeams >= 11 ? '' : 'opacity-0'}`}></div>
                           </div>
                        </div>
                        {renderMatchCard('QF4')}
                      </div>

                    </div>

                    {/* Connector SF2 */}
                    <div className="flex items-center w-12">
                      <div className="w-1/2 border-r-2 border-y-2 border-slate-300 rounded-r-xl h-[104px]"></div>
                      <div className="w-1/2 border-b-2 border-slate-300"></div>
                    </div>
                    {renderMatchCard('SF2')}
                  </div>

                </div>

                {/* Grand Final Connector */}
                <div className="flex items-center w-12">
                  <div className="w-1/2 border-r-2 border-y-2 border-slate-300 rounded-r-xl h-[224px]"></div>
                  <div className="w-1/2 border-b-2 border-slate-300"></div>
                </div>
                {renderMatchCard('GF')}
              </div>
            </div>
          </div>
        )}

        {/* TIMELINE VIEW */}
        {activeTab === 'timeline' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">Time</th>
                    <th className="px-6 py-4 font-bold">Court</th>
                    <th className="px-6 py-4 font-bold">Match ID</th>
                    <th className="px-6 py-4 font-bold">Matchup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scheduleData.timeline.map((match) => (
                    <tr key={match.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                          <Clock className="w-4 h-4 text-indigo-400" />
                          {match.startTimeFormatted} - {match.endTimeFormatted}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
                          <MapPin className="w-3.5 h-3.5" />
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
                        <div className="flex items-center gap-3 text-sm">
                          <span className={`flex-1 font-medium text-right truncate w-[140px] ${match.team1.includes('Winner') ? 'text-slate-400 font-mono text-[11px]' : 'text-slate-800'}`}>
                            {match.team1}
                          </span>
                          <span className="text-[10px] font-black text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded">VS</span>
                          <span className={`flex-1 font-medium truncate w-[140px] ${match.team2.includes('Winner') ? 'text-slate-400 font-mono text-[11px]' : 'text-slate-800'}`}>
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