import React, { useState, useMemo } from 'react';
import { Clock, Users, Calendar, MapPin, ChevronRight, LayoutGrid, List } from 'lucide-react';

// Utility to convert raw minutes (e.g. 540) to a readable time string (e.g. 9:00 AM)
const formatTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
};

// Utility to parse 'HH:MM' string from input into total minutes from midnight
const parseTime = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

export default function SwissSchedulerApp() {
  // Application State
  const [activeTab, setActiveTab] = useState('rounds'); // 'rounds' or 'timeline'
  const [numTeams, setNumTeams] = useState(8);
  const [numCourts, setNumCourts] = useState(2);
  const [matchDuration, setMatchDuration] = useState(30);
  const [startTime, setStartTime] = useState('09:00');

  // Derived state to determine if an odd-team BYE is needed
  const hasBye = numTeams % 2 !== 0;

  // The core memoized algorithm that rebuilds whenever settings change
  const scheduleData = useMemo(() => {
    // 1. Setup basic tournament variables
    const totalSlots = hasBye ? numTeams + 1 : numTeams;
    const matchesPerRound = totalSlots / 2;
    // Swiss tournaments typically run for log2(N) rounds to find a clear winner
    const totalRounds = Math.ceil(Math.log2(numTeams));

    const roundsOverview = [];
    const timelineSchedule = [];
    
    // 2. Initialize Court Availability for chronologial scheduling
    let startMinutes = parseTime(startTime);
    // Track when each court is free next
    let courtAvailability = Array(numCourts).fill(startMinutes);

    // 3. Generate Rounds & Timeline
    for (let r = 1; r <= totalRounds; r++) {
      const currentRoundMatches = [];
      
      // SWISS RULE: Round N+1 cannot start until ALL matches in Round N are completely finished.
      // We enforce this by finding the absolute latest end time of the previous round 
      // and forcing all courts to sync to that time before beginning the new round.
      if (r > 1) {
        const absoluteRoundStartTime = Math.max(...courtAvailability);
        courtAvailability.fill(absoluteRoundStartTime);
      }

      for (let m = 0; m < matchesPerRound; m++) {
        let team1 = '';
        let team2 = '';
        let isBye = false;

        if (r === 1) {
          // ROUND 1: Deterministic pairings since everyone is 0-0
          team1 = `Team ${(m * 2) + 1}`;
          if (hasBye && m === matchesPerRound - 1) {
             team2 = 'BYE';
             isBye = true;
          } else {
             team2 = `Team ${(m * 2) + 2}`;
          }
        } else {
          // ROUND 2+: Dynamic placeholders based on Swiss records
          if (hasBye && m === matchesPerRound - 1) {
             team1 = `{{ R${r-1} Lowest Rank }}`;
             team2 = 'BYE';
             isBye = true;
          } else {
             team1 = `{{ R${r-1} Record Pool - Player A }}`;
             team2 = `{{ R${r-1} Record Pool - Player B }}`;
          }
        }

        currentRoundMatches.push({ id: `R${r}-M${m+1}`, team1, team2, isBye });

        // Schedule physical courts (skip BYE matches as they don't consume court time)
        if (!isBye) {
          // Find earliest available court
          const earliestCourtTime = Math.min(...courtAvailability);
          const courtIdx = courtAvailability.indexOf(earliestCourtTime);
          
          const matchStart = earliestCourtTime;
          const matchEnd = matchStart + matchDuration;

          timelineSchedule.push({
            id: `TL-R${r}-M${m+1}`,
            round: r,
            court: courtIdx + 1,
            startMins: matchStart,
            endMins: matchEnd,
            startTimeFormatted: formatTime(matchStart),
            endTimeFormatted: formatTime(matchEnd),
            team1,
            team2
          });

          // Update court availability
          courtAvailability[courtIdx] = matchEnd;
        }
      }
      roundsOverview.push({ round: r, matches: currentRoundMatches });
    }

    // Sort timeline chronologically, then by court number
    timelineSchedule.sort((a, b) => {
      if (a.startMins !== b.startMins) return a.startMins - b.startMins;
      return a.court - b.court;
    });

    return { roundsOverview, timelineSchedule };
  }, [numTeams, numCourts, matchDuration, startTime]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-indigo-600" />
            Swiss Scheduler Pro
          </h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Simulate and schedule a Swiss-system tournament. Future rounds use placeholders as pairings depend strictly on the results of the previous round.
          </p>
        </header>

        {/* Configuration Panel */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex justify-between">
              <span>Number of Teams</span>
              <span className="text-indigo-600 font-bold">{numTeams}</span>
            </label>
            <input 
              type="range" min="4" max="16" step="1"
              value={numTeams} 
              onChange={(e) => setNumTeams(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex justify-between">
              <span>Available Courts</span>
              <span className="text-indigo-600 font-bold">{numCourts}</span>
            </label>
            <input 
              type="range" min="1" max="4" step="1"
              value={numCourts} 
              onChange={(e) => setNumCourts(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 block mb-2">Match Duration (mins)</label>
            <div className="relative">
              <Clock className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
              <input 
                type="number" min="5" max="120" step="5"
                value={matchDuration}
                onChange={(e) => setMatchDuration(Number(e.target.value))}
                className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium text-slate-700"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 block mb-2">Tournament Start</label>
            <input 
              type="time" 
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium text-slate-700"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-md mx-auto sm:mx-0">
          <button
            onClick={() => setActiveTab('rounds')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'rounds' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <LayoutGrid className="w-4 h-4" /> Rounds Overview
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'timeline' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <List className="w-4 h-4" /> Court Timeline
          </button>
        </div>

        {/* Tab 1: Rounds Overview */}
        {activeTab === 'rounds' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {scheduleData.roundsOverview.map((roundObj) => (
              <div key={roundObj.round} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="bg-indigo-50 border-b border-indigo-100 p-4">
                  <h3 className="font-bold text-indigo-900 flex items-center justify-between">
                    <span>Round {roundObj.round}</span>
                    <span className="text-xs font-semibold text-indigo-500 bg-indigo-100 px-2 py-1 rounded-full">
                      {roundObj.matches.length} Matches
                    </span>
                  </h3>
                </div>
                <div className="p-4 flex-1 flex flex-col gap-3">
                  {roundObj.matches.map((match, idx) => (
                    <div 
                      key={match.id} 
                      className={`flex items-center justify-between p-3 rounded-xl border text-sm font-medium ${
                        match.isBye 
                          ? 'bg-amber-50 border-amber-200 text-amber-800' 
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300 transition-colors'
                      }`}
                    >
                      <div className="flex-1 truncate pr-2">
                        <span className={match.team1.includes('{{') ? 'text-indigo-600/80 font-mono text-xs' : ''}>
                          {match.team1}
                        </span>
                      </div>
                      <div className="px-2 text-xs font-bold text-slate-400">
                        {match.isBye ? 'REST' : 'VS'}
                      </div>
                      <div className="flex-1 text-right truncate pl-2">
                        <span className={match.team2.includes('{{') ? 'text-indigo-600/80 font-mono text-xs' : ''}>
                          {match.team2}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {roundObj.round > 1 && (
                  <div className="bg-slate-50 p-3 text-xs text-slate-500 border-t border-slate-100 text-center">
                    Pairings pending Round {roundObj.round - 1} results
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Court & Timeline Schedule */}
        {activeTab === 'timeline' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                    <th className="px-6 py-4">Time Slot</th>
                    <th className="px-6 py-4">Round</th>
                    <th className="px-6 py-4">Court</th>
                    <th className="px-6 py-4">Matchup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scheduleData.timelineSchedule.map((match, idx) => {
                    // Logic to visually separate rounds with a solid border
                    const isNewRound = idx === 0 || scheduleData.timelineSchedule[idx-1].round !== match.round;

                    return (
                      <React.Fragment key={match.id}>
                        {isNewRound && idx !== 0 && (
                          <tr>
                            <td colSpan="4" className="bg-indigo-50/50 border-t-2 border-indigo-100 px-6 py-2">
                              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Round Boundary Enforced - Calculating Standings
                              </span>
                            </td>
                          </tr>
                        )}
                        <tr className="hover:bg-slate-50/70 transition-colors group">
                          <td className="px-6 py-4 font-mono text-sm text-slate-600 whitespace-nowrap">
                            <span className="font-bold text-slate-800">{match.startTimeFormatted}</span>
                            <span className="text-slate-400 mx-2">-</span>
                            <span>{match.endTimeFormatted}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold bg-slate-100 text-slate-700 rounded-md">
                              R{match.round}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                              <MapPin className="w-4 h-4 text-emerald-500" />
                              Court {match.court}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 text-sm">
                              <span className={`flex-1 font-medium text-right truncate max-w-[200px] ${match.team1.includes('{{') ? 'text-indigo-600 font-mono text-xs' : 'text-slate-800'}`}>
                                {match.team1}
                              </span>
                              <span className="text-xs font-bold text-slate-300">VS</span>
                              <span className={`flex-1 font-medium truncate max-w-[200px] ${match.team2.includes('{{') ? 'text-indigo-600 font-mono text-xs' : 'text-slate-800'}`}>
                                {match.team2}
                              </span>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Legend for BYEs */}
            {hasBye && (
              <div className="bg-amber-50 border-t border-amber-100 p-4 text-sm text-amber-800 flex items-start gap-3">
                 <div className="mt-0.5 font-bold uppercase text-xs tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded">Note</div>
                 <p>
                   Because there is an odd number of teams ({numTeams}), one team will receive a BYE (rest period) each round. 
                   BYEs are not scheduled on courts and do not consume time slots.
                 </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}