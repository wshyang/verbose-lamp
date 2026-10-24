import React, { useState, useMemo } from 'react';
import { Clock, Users, MapPin, LayoutGrid, List, Trophy, ArrowRight, Grid, CalendarDays } from 'lucide-react';

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

// Tournament presets for perfectly structured hybrid formats
const TOURNAMENT_PRESETS = {
  10: { label: "10 Teams (2 Groups of 5)", groups: 2, knockoutTeams: 4 },
  16: { label: "16 Teams (4 Groups of 4)", groups: 4, knockoutTeams: 8 },
  32: { label: "32 Teams (8 Groups of 4)", groups: 8, knockoutTeams: 16 }
};

export default function WorldCupSimulatorApp() {
  const [activeTab, setActiveTab] = useState('groups'); // 'groups', 'bracket', 'timeline'
  const [presetKey, setPresetKey] = useState(10);
  const [numCourts, setNumCourts] = useState(3);
  const [matchDuration, setMatchDuration] = useState(30);
  const [startTime, setStartTime] = useState('09:00');

  const scheduleData = useMemo(() => {
    const preset = TOURNAMENT_PRESETS[presetKey];
    const startMinutes = parseTime(startTime);
    const teamsPerGroup = presetKey / preset.groups;
    
    let courtAvailability = Array(numCourts).fill(startMinutes);
    let teamEndTimes = {};
    const timelineSchedule = [];
    const groupData = [];

    // ==============================================
    // PHASE 1: THE GROUP STAGE
    // ==============================================
    let globalMatchCounter = 1;
    let allGroupsEndTime = startMinutes;
    
    // Generate Round Robin logic for each group independently
    for (let g = 0; g < preset.groups; g++) {
      const groupLetter = String.fromCharCode(65 + g); // A, B, C, etc.
      let teams = Array.from({ length: teamsPerGroup }, (_, i) => `${groupLetter}${i + 1}`);
      const isOdd = teams.length % 2 !== 0;
      if (isOdd) teams.push('BYE');

      const totalRounds = teams.length - 1;
      const matchesPerRound = teams.length / 2;
      const groupMatchesList = [];

      for (let round = 0; round < totalRounds; round++) {
        for (let match = 0; match < matchesPerRound; match++) {
          const home = teams[match];
          const away = teams[teams.length - 1 - match];

          if (home !== 'BYE' && away !== 'BYE') {
            const team1 = home;
            const team2 = away;
            const matchId = `G${globalMatchCounter++}`;
            
            // Find earliest time both teams AND a court are free
            const t1Ready = teamEndTimes[team1] || startMinutes;
            const t2Ready = teamEndTimes[team2] || startMinutes;
            const teamsReadyAt = Math.max(t1Ready, t2Ready);

            let bestCourtIdx = 0;
            let earliestActualStart = Infinity;

            for (let c = 0; c < numCourts; c++) {
              const potentialStart = Math.max(courtAvailability[c], teamsReadyAt);
              if (potentialStart < earliestActualStart) {
                earliestActualStart = potentialStart;
                bestCourtIdx = c;
              }
            }

            const matchStart = earliestActualStart;
            const matchEnd = matchStart + matchDuration;

            teamEndTimes[team1] = matchEnd;
            teamEndTimes[team2] = matchEnd;
            courtAvailability[bestCourtIdx] = matchEnd;
            
            if (matchEnd > allGroupsEndTime) {
              allGroupsEndTime = matchEnd;
            }

            const matchObj = {
              id: matchId,
              phase: 'Group Stage',
              roundName: `Group ${groupLetter}`,
              court: bestCourtIdx + 1,
              startMins: matchStart,
              endMins: matchEnd,
              startTimeFormatted: formatTime(matchStart),
              endTimeFormatted: formatTime(matchEnd),
              team1,
              team2
            };
            
            groupMatchesList.push(matchObj);
            timelineSchedule.push(matchObj);
          }
        }
        // Rotate for next round
        const lastTeam = teams.pop();
        teams.splice(1, 0, lastTeam);
      }
      groupData.push({ letter: groupLetter, matches: groupMatchesList });
    }

    // ==============================================
    // PHASE 2: THE KNOCKOUT BRACKET
    // ==============================================
    
    // Add a small buffer (e.g., 30 mins) between Group Stage and Knockouts for teams to rest
    const knockoutStartTime = allGroupsEndTime + 30; 
    courtAvailability = Array(numCourts).fill(knockoutStartTime);
    
    const knockoutRounds = [];
    const totalKoRounds = Math.log2(preset.knockoutTeams);
    const koMatchEndTimes = {};

    for (let r = 1; r <= totalKoRounds; r++) {
      const currentRoundMatches = [];
      const matchesInThisRound = preset.knockoutTeams / Math.pow(2, r);
      
      let roundName = `KO Round ${r}`;
      if (matchesInThisRound === 1) roundName = "Grand Final";
      else if (matchesInThisRound === 2) roundName = "Semi-Finals";
      else if (matchesInThisRound === 4) roundName = "Quarter-Finals";
      else if (matchesInThisRound === 8) roundName = "Round of 16";

      for (let m = 0; m < matchesInThisRound; m++) {
        const matchId = `KO-R${r}-M${m+1}`;
        let team1, team2, readyTime;

        if (r === 1) {
          // Hardcode authentic cross-group matchups for Round 1
          if (presetKey === 10) { // 2 groups -> 4 KO teams
            team1 = m === 0 ? '1st Group A' : '1st Group B';
            team2 = m === 0 ? '2nd Group B' : '2nd Group A';
          } else if (presetKey === 16) { // 4 groups -> 8 KO teams
            const matchups = [['1st Grp A', '2nd Grp B'], ['1st Grp C', '2nd Grp D'], ['1st Grp B', '2nd Grp A'], ['1st Grp D', '2nd Grp C']];
            team1 = matchups[m][0]; team2 = matchups[m][1];
          } else { // 32 teams -> 8 groups -> 16 KO teams
            const matchups = [
              ['1st A','2nd B'], ['1st C','2nd D'], ['1st E','2nd F'], ['1st G','2nd H'],
              ['1st B','2nd A'], ['1st D','2nd C'], ['1st F','2nd E'], ['1st H','2nd G']
            ];
            team1 = matchups[m][0]; team2 = matchups[m][1];
          }
          readyTime = knockoutStartTime;
        } else {
          // Dynamic placeholders for subsequent rounds
          const prevMatch1Id = `KO-R${r-1}-M${(m * 2) + 1}`;
          const prevMatch2Id = `KO-R${r-1}-M${(m * 2) + 2}`;
          team1 = `{{ Winner ${prevMatch1Id} }}`;
          team2 = `{{ Winner ${prevMatch2Id} }}`;
          readyTime = Math.max(koMatchEndTimes[prevMatch1Id], koMatchEndTimes[prevMatch2Id]);
        }

        // Schedule on available court
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
        koMatchEndTimes[matchId] = matchEnd;
        courtAvailability[bestCourtIdx] = matchEnd;

        const matchObj = {
          id: matchId,
          phase: 'Knockout',
          roundName: roundName,
          court: bestCourtIdx + 1,
          startMins: matchStart,
          endMins: matchEnd,
          startTimeFormatted: formatTime(matchStart),
          endTimeFormatted: formatTime(matchEnd),
          team1,
          team2
        };

        currentRoundMatches.push(matchObj);
        timelineSchedule.push(matchObj);
      }
      knockoutRounds.push({ round: r, name: roundName, matches: currentRoundMatches });
    }

    timelineSchedule.sort((a, b) => {
      if (a.startMins !== b.startMins) return a.startMins - b.startMins;
      return a.court - b.court;
    });

    return { groupData, knockoutRounds, timelineSchedule };
  }, [presetKey, numCourts, matchDuration, startTime]);

  // Dynamic layout calculations
  const bracketHeight = Math.max(600, (TOURNAMENT_PRESETS[presetKey].knockoutTeams / 2) * 120);
  const flexHeight = bracketHeight - 80;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-8 font-sans selection:bg-indigo-200">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              World Cup Format Simulator
            </h1>
          </div>
          <p className="text-slate-500 max-w-3xl">
            Experience the "Group Stage to Knockout" hybrid. First, teams fight through miniature round-robins to guarantee playtime. Then, a massive phase-barrier ensures all group matches conclude before the top seeds are funneled into a ruthless single-elimination bracket.
          </p>
        </header>

        {/* Configuration Panel */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex justify-between">
              <span>Tournament Scale</span>
            </label>
            <select 
              value={presetKey}
              onChange={(e) => setPresetKey(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
            >
              {Object.entries(TOURNAMENT_PRESETS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex justify-between">
              <span>Available Courts</span>
              <span className="text-indigo-600 font-bold">{numCourts}</span>
            </label>
            <input 
              type="range" min="1" max="10" step="1"
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
                type="number" min="10" max="120" step="5"
                value={matchDuration}
                onChange={(e) => setMatchDuration(Number(e.target.value))}
                className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 block mb-2">Tournament Start</label>
            <input 
              type="time" 
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex p-1 bg-slate-200/60 rounded-xl max-w-xl mx-auto sm:mx-0">
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'groups' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" /> 1. Group Stage
          </button>
          <button
            onClick={() => setActiveTab('bracket')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'bracket' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <LayoutGrid className="w-4 h-4" /> 2. Knockout
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'timeline' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CalendarDays className="w-4 h-4" /> Master Timeline
          </button>
        </div>

        {/* Tab 1: Groups */}
        {activeTab === 'groups' && (
          <div className="animate-in fade-in duration-300">
             <div className="mb-4 bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-xl">
              <p className="text-sm text-indigo-800">
                <strong>Phase 1: Minimum Playtime Guarantee.</strong> Every team plays a round-robin exclusively within their assigned group. The top 2 from each group will graduate to the Knockout stage.
              </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {scheduleData.groupData.map((group) => (
                <div key={group.letter} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">Group {group.letter}</h3>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-white border border-slate-200 rounded-full text-slate-500 shadow-sm">
                      {presetKey / TOURNAMENT_PRESETS[presetKey].groups} Teams
                    </span>
                  </div>
                  <div className="p-0">
                    <table className="w-full text-left border-collapse">
                      <tbody className="divide-y divide-slate-100">
                        {group.matches.map((match) => (
                          <tr key={match.id} className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-4 py-3 text-xs font-medium text-slate-400 w-16 text-center">
                               {match.id}
                             </td>
                             <td className="px-4 py-3 text-sm font-semibold text-slate-700 text-right w-1/3">
                               {match.team1}
                             </td>
                             <td className="px-2 py-3 text-xs font-bold text-slate-300 text-center w-8">
                               VS
                             </td>
                             <td className="px-4 py-3 text-sm font-semibold text-slate-700 w-1/3">
                               {match.team2}
                             </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Bracket */}
        {activeTab === 'bracket' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-x-auto animate-in fade-in duration-300">
             <div className="mb-6 bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl inline-block">
              <p className="text-sm text-rose-800">
                <strong>Phase 2: Sudden Death.</strong> This phase is locked until <em>every single match</em> in the Group Stage is finished. 
              </p>
            </div>

            <div className="flex flex-row min-w-max gap-8" style={{ height: `${bracketHeight}px` }}>
              {scheduleData.knockoutRounds.map((roundObj, idx) => (
                <div key={roundObj.round} className="flex flex-col justify-around w-64 flex-shrink-0 relative h-full">
                  
                  <div className="absolute top-0 w-full text-center pb-4 border-b-2 border-slate-100">
                    <h3 className="font-bold text-slate-800 uppercase tracking-widest text-sm">{roundObj.name}</h3>
                  </div>

                  <div className="flex flex-col justify-around h-full pt-16 pb-4">
                    {roundObj.matches.map((match) => (
                      <div key={match.id} className="relative group w-full">
                        
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden relative z-10 transition-shadow hover:shadow-md hover:border-indigo-300">
                          <div className="bg-slate-50 border-b border-slate-100 px-3 py-1.5 flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider">
                            <span className="font-bold text-slate-600">{match.id}</span>
                            <span>Phase 2</span>
                          </div>
                          
                          <div className="flex flex-col">
                            <div className="px-3 py-2 border-b border-slate-100 bg-white">
                              <span className={`text-sm block truncate ${match.team1.includes('Grp') || match.team1.includes('{{') ? 'text-indigo-600 font-mono text-xs' : 'font-semibold text-slate-800'}`}>
                                {match.team1}
                              </span>
                            </div>
                            <div className="px-3 py-2 bg-white">
                              <span className={`text-sm block truncate ${match.team2.includes('Grp') || match.team2.includes('{{') ? 'text-indigo-600 font-mono text-xs' : 'font-semibold text-slate-800'}`}>
                                {match.team2}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="absolute top-1/2 -right-4 w-4 h-[2px] bg-slate-300 z-0"></div>
                        
                        {idx > 0 && (
                          <>
                            <div className="absolute top-1/2 -left-4 w-4 h-[2px] bg-slate-300 z-0"></div>
                            <div
                              className="absolute bg-slate-300 w-[2px] z-0"
                              style={{
                                height: `${flexHeight / scheduleData.knockoutRounds[idx - 1].matches.length}px`,
                                top: '50%',
                                left: '-1rem',
                                transform: 'translateY(-50%)'
                              }}
                            ></div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex flex-col justify-around w-64 flex-shrink-0 relative h-full">
                <div className="absolute top-0 w-full text-center pb-4 border-b-2 border-amber-100">
                  <h3 className="font-bold text-amber-600 uppercase tracking-widest text-sm">Champion</h3>
                </div>
                <div className="flex flex-col justify-around h-full pt-16 pb-4">
                  <div className="relative group w-full flex justify-center">
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 text-center shadow-lg relative z-10 w-full flex flex-col items-center gap-3">
                      <Trophy className="w-12 h-12 text-amber-500" />
                      <span className="font-mono text-xs text-amber-700 font-bold block">
                        {`{{ Final Winner }}`}
                      </span>
                    </div>
                    <div className="absolute top-1/2 -left-4 w-4 h-[2px] bg-slate-300 z-0"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Timeline */}
        {activeTab === 'timeline' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                    <th className="px-6 py-4">Time Slot</th>
                    <th className="px-6 py-4">Phase & Round</th>
                    <th className="px-6 py-4">Court</th>
                    <th className="px-6 py-4">Matchup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scheduleData.timelineSchedule.map((match) => (
                    <tr key={match.id} className={`hover:bg-slate-50/70 transition-colors group ${match.phase === 'Knockout' ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-6 py-4 font-mono text-sm text-slate-600 whitespace-nowrap">
                        <span className="font-bold text-slate-800">{match.startTimeFormatted}</span>
                        <span className="text-slate-400 mx-2">-</span>
                        <span>{match.endTimeFormatted}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`text-[10px] uppercase tracking-wider font-bold w-max px-2 py-0.5 rounded ${match.phase === 'Knockout' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'}`}>
                            {match.phase}
                          </span>
                          <span className="text-xs font-bold text-slate-700">{match.roundName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                          <MapPin className={`w-4 h-4 ${match.phase === 'Knockout' ? 'text-rose-500' : 'text-indigo-500'}`} />
                          Court {match.court}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm">
                          <span className={`flex-1 font-medium sm:text-right truncate max-w-[200px] ${match.team1.includes('Grp') || match.team1.includes('{{') ? 'text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-mono text-xs' : 'text-slate-800'}`}>
                            {match.team1}
                          </span>
                          <span className="text-xs font-bold text-slate-300 self-start sm:self-center">VS</span>
                          <span className={`flex-1 font-medium truncate max-w-[200px] ${match.team2.includes('Grp') || match.team2.includes('{{') ? 'text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-mono text-xs' : 'text-slate-800'}`}>
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