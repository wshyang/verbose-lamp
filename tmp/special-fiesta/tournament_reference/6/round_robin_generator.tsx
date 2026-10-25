import React, { useState, useMemo } from 'react';
import { Clock, Users, Calendar, MapPin, LayoutList, List, CheckCircle2 } from 'lucide-react';

// 1. Core Round-Robin Logic (Circle Method)
function generateRoundRobin(numTeams) {
  const teams = Array.from({ length: numTeams }, (_, i) => `Team ${i + 1}`);
  
  if (numTeams % 2 !== 0) {
    teams.push('BYE');
  }

  const totalRounds = teams.length - 1;
  const matchesPerRound = teams.length / 2;
  const schedule = [];
  const currentTeams = [...teams];

  for (let round = 0; round < totalRounds; round++) {
    const roundMatches = [];
    for (let match = 0; match < matchesPerRound; match++) {
      const home = currentTeams[match];
      const away = currentTeams[currentTeams.length - 1 - match];
      roundMatches.push({ home, away });
    }
    schedule.push({ round: round + 1, matches: roundMatches });

    const lastTeam = currentTeams.pop();
    currentTeams.splice(1, 0, lastTeam);
  }

  return schedule;
}

// Helper to format Date to HH:MM AM/PM
function formatTime(dateObj) {
  return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// 2. Intelligent Scheduling Algorithm
function buildMasterSchedule(basicRounds, startTimeStr, durationMinutes, numCourts) {
  const baseDate = new Date(`2024-01-01T${startTimeStr}:00`);
  
  const courtFreeTime = Array(numCourts).fill(baseDate.getTime());
  const teamFreeTime = {}; 
  
  const scheduledMatches = [];
  const byesList = [];

  basicRounds.forEach(roundData => {
    roundData.matches.forEach(match => {
      if (match.home === 'BYE' || match.away === 'BYE') {
        const restingTeam = match.home === 'BYE' ? match.away : match.home;
        byesList.push({ round: roundData.round, team: restingTeam });
        return;
      }

      const homeFree = teamFreeTime[match.home] || baseDate.getTime();
      const awayFree = teamFreeTime[match.away] || baseDate.getTime();
      const teamEarliest = Math.max(homeFree, awayFree);

      let bestCourt = 0;
      let bestStart = Infinity;
      
      for (let i = 0; i < numCourts; i++) {
        const possibleStart = Math.max(courtFreeTime[i], teamEarliest);
        if (possibleStart < bestStart) {
          bestStart = possibleStart;
          bestCourt = i;
        }
      }

      const endTime = bestStart + (durationMinutes * 60000);
      
      courtFreeTime[bestCourt] = endTime;
      teamFreeTime[match.home] = endTime;
      teamFreeTime[match.away] = endTime;

      scheduledMatches.push({
        round: roundData.round,
        home: match.home,
        away: match.away,
        court: bestCourt + 1,
        start: new Date(bestStart),
        end: new Date(endTime)
      });
    });
  });

  scheduledMatches.sort((a, b) => a.start.getTime() - b.start.getTime());

  return { scheduledMatches, byesList };
}

export default function RoundRobinGenerator() {
  const [teamCount, setTeamCount] = useState(5);
  const [courts, setCourts] = useState(2);
  const [matchDuration, setMatchDuration] = useState(30);
  const [startTime, setStartTime] = useState("09:00");
  const [activeTab, setActiveTab] = useState('rounds'); // 'rounds' or 'timeline'

  // Memoize both datasets to avoid unneeded recalculations
  const { basicRounds, scheduledMatches, byesList } = useMemo(() => {
    const rounds = generateRoundRobin(teamCount);
    const validCourts = Math.max(1, parseInt(courts) || 1);
    const validDuration = Math.max(1, parseInt(matchDuration) || 30);
    const timelineData = buildMasterSchedule(rounds, startTime, validDuration, validCourts);
    
    return {
      basicRounds: rounds,
      scheduledMatches: timelineData.scheduledMatches,
      byesList: timelineData.byesList
    };
  }, [teamCount, courts, matchDuration, startTime]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
              <Calendar className="w-8 h-8 text-blue-600" />
              Tournament Scheduler
            </h1>
            <p className="text-slate-500 mt-2 max-w-2xl text-sm sm:text-base">
              Configure parameters below. Use the tabs to view the schedule by discrete rounds or as a chronological master timeline mapped to available courts.
            </p>
          </div>
        </header>

        {/* Configuration Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Teams Slider */}
          <div>
            <label className="flex items-center text-sm font-semibold text-slate-700 mb-3">
              <Users className="w-4 h-4 mr-2 text-slate-400" />
              Teams: <span className="text-blue-600 font-bold ml-2 text-lg">{teamCount}</span>
            </label>
            <input 
              type="range" 
              min="3" max="12" 
              value={teamCount} 
              onChange={(e) => setTeamCount(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1 px-1">
              <span>3</span>
              <span>12</span>
            </div>
          </div>

          {/* Courts Slider */}
          <div>
            <label className="flex items-center text-sm font-semibold text-slate-700 mb-3">
              <MapPin className="w-4 h-4 mr-2 text-slate-400" />
              Courts: <span className="text-blue-600 font-bold ml-2 text-lg">{courts}</span>
            </label>
            <input 
              type="range" 
              min="1" max="6" 
              value={courts} 
              onChange={(e) => setCourts(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1 px-1">
              <span>1</span>
              <span>6</span>
            </div>
          </div>

          {/* Duration Input */}
          <div>
            <label className="flex items-center text-sm font-semibold text-slate-700 mb-2">
              <Clock className="w-4 h-4 mr-2 text-slate-400" />
              Match Length (min)
            </label>
            <input 
              type="number" 
              min="5" max="120"
              value={matchDuration}
              onChange={(e) => setMatchDuration(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Start Time Input */}
          <div>
            <label className="flex items-center text-sm font-semibold text-slate-700 mb-2">
              <Clock className="w-4 h-4 mr-2 text-slate-400" />
              Start Time
            </label>
            <input 
              type="time" 
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('rounds')}
              className={`${
                activeTab === 'rounds'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
            >
              <LayoutList className="w-5 h-5 mr-2" />
              By Round
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`${
                activeTab === 'timeline'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors`}
            >
              <List className="w-5 h-5 mr-2" />
              Timeline & Courts
            </button>
          </nav>
        </div>

        {/* Tab Contents */}
        <div className="py-4">
          
          {activeTab === 'rounds' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {basicRounds.map((round) => (
                <div key={round.round} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                    <h3 className="font-bold text-slate-800">Round {round.round}</h3>
                  </div>
                  <div className="p-4 flex-1 flex flex-col gap-3">
                    {round.matches.map((match, idx) => {
                      const isBye = match.home === 'BYE' || match.away === 'BYE';
                      if (isBye) {
                        const team = match.home === 'BYE' ? match.away : match.home;
                        return (
                          <div key={idx} className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-center flex items-center justify-center gap-2">
                            <span className="font-semibold text-amber-900">{team}</span>
                            <span className="text-xs font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full uppercase">BYE</span>
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="p-3 bg-white border border-slate-100 shadow-sm rounded-lg flex items-center justify-between">
                          <span className="font-semibold text-slate-700 w-2/5 text-right">{match.home}</span>
                          <span className="text-xs font-bold text-slate-300 uppercase w-1/5 text-center">vs</span>
                          <span className="font-semibold text-slate-700 w-2/5 text-left">{match.away}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              
              {/* Main Timeline Table */}
              <div className="lg:col-span-3 space-y-4">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                          <th className="px-6 py-4">Time</th>
                          <th className="px-6 py-4">Matchup</th>
                          <th className="px-6 py-4 text-center">Round</th>
                          <th className="px-6 py-4 text-center">Court</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {scheduledMatches.map((match, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-bold text-slate-800">{formatTime(match.start)}</div>
                              <div className="text-xs text-slate-400">to {formatTime(match.end)}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <span className="font-semibold text-slate-700">{match.home}</span>
                                <span className="text-xs font-bold text-slate-300 uppercase">vs</span>
                                <span className="font-semibold text-slate-700">{match.away}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center whitespace-nowrap">
                              <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">
                                Round {match.round}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center whitespace-nowrap">
                              <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold bg-blue-50 border border-blue-100 text-blue-700 rounded-md">
                                Court {match.court}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Sidebar Stats and Byes List for Timeline Tab */}
              <div className="lg:col-span-1 space-y-6">
                
                {/* Stats */}
                <div className="bg-slate-800 text-white rounded-2xl shadow-sm p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Summary</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 text-sm">Total Matches</span>
                      <span className="font-bold text-xl">{scheduledMatches.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 text-sm">Total Rounds</span>
                      <span className="font-bold text-xl">{teamCount % 2 === 0 ? teamCount - 1 : teamCount}</span>
                    </div>
                  </div>
                </div>

                {/* Resting Teams */}
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center mb-4">
                    Resting Teams
                  </h2>
                  
                  {byesList.length === 0 ? (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center text-emerald-800 flex flex-col items-center">
                      <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-500" />
                      <p className="text-sm font-medium">Even number of teams. No BYEs.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                      <ul className="divide-y divide-slate-100">
                        {byesList.map((byeData, idx) => (
                          <li key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <span className="text-sm font-semibold text-slate-700">
                              {byeData.team}
                            </span>
                            <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-1 rounded-full uppercase">
                              Round {byeData.round}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}