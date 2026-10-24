import React, { useState } from 'react';
import { Swords, Clock, Trophy, MapPin, Grid, CalendarDays, Flame, AlertCircle } from 'lucide-react';

export default function IronmanSimulator() {
  const [activeTab, setActiveTab] = useState('timeline');

  // Hardcoded for the 100-minute, 12-team math constraint
  const totalMinutes = 100;
  const numTeams = 12;
  const numCourts = 3;

  // The schedule is mathematically interwoven to fit exactly into 5 time slots.
  // We actively track teams that have 0 rest between slots.
  const timelineMatches = [
    // SLOT 1: 0 - 20 mins
    { id: 'R1-M1', phase: 'Round 1', team1: 'Seed 8', team2: 'Seed 9', court: 1, time: '0:00 - 0:20', ironman: false },
    { id: 'R1-M2', phase: 'Round 1', team1: 'Seed 5', team2: 'Seed 12', court: 2, time: '0:00 - 0:20', ironman: false },
    { id: 'R1-M3', phase: 'Round 1', team1: 'Seed 6', team2: 'Seed 11', court: 3, time: '0:00 - 0:20', ironman: false },

    // SLOT 2: 20 - 40 mins
    // Winner M1 and Winner M2 must play their Quarterfinals immediately!
    { id: 'R1-M4', phase: 'Round 1', team1: 'Seed 7', team2: 'Seed 10', court: 1, time: '0:20 - 0:40', ironman: false },
    { id: 'QF-1', phase: 'Quarterfinal', team1: 'Seed 1 (Rested)', team2: 'Winner R1-M1', court: 2, time: '0:20 - 0:40', ironman: true, ironmanMsg: 'Zero rest for Winner R1-M1' },
    { id: 'QF-2', phase: 'Quarterfinal', team1: 'Seed 4 (Rested)', team2: 'Winner R1-M2', court: 3, time: '0:20 - 0:40', ironman: true, ironmanMsg: 'Zero rest for Winner R1-M2' },

    // SLOT 3: 40 - 60 mins
    // Winner M4 must play their Quarterfinal immediately!
    // Winner M3 gets to play because they had a 20-minute rest during Slot 2.
    { id: 'QF-3', phase: 'Quarterfinal', team1: 'Seed 3 (Rested)', team2: 'Winner R1-M3', court: 1, time: '0:40 - 1:00', ironman: false },
    { id: 'QF-4', phase: 'Quarterfinal', team1: 'Seed 2 (Rested)', team2: 'Winner R1-M4', court: 2, time: '0:40 - 1:00', ironman: true, ironmanMsg: 'Zero rest for Winner R1-M4' },
    { id: 'EMPTY', phase: 'Rest / Buffer', team1: '-', team2: '-', court: 3, time: '0:40 - 1:00', isEmpty: true },

    // SLOT 4: 60 - 80 mins
    // QF3 & QF4 just finished. Those winners must play SF-2 immediately!
    { id: 'SF-1', phase: 'Semi-Final', team1: 'Winner QF-1', team2: 'Winner QF-2', court: 1, time: '1:00 - 1:20', ironman: false, msg: 'Both teams had 20m rest' },
    { id: 'SF-2', phase: 'Semi-Final', team1: 'Winner QF-3', team2: 'Winner QF-4', court: 2, time: '1:00 - 1:20', ironman: true, ironmanMsg: 'Zero rest for BOTH Winners!' },
    { id: 'EMPTY', phase: 'Rest / Buffer', team1: '-', team2: '-', court: 3, time: '1:00 - 1:20', isEmpty: true },

    // SLOT 5: 80 - 100 mins
    // SF2 just finished. That winner must play the Grand Final immediately!
    { id: 'FINAL', phase: 'Grand Final', team1: 'Winner SF-1', team2: 'Winner SF-2', court: 2, time: '1:20 - 1:40', ironman: true, ironmanMsg: 'Zero rest for Winner SF-2!' },
    { id: 'EMPTY', phase: 'Rest / Buffer', team1: '-', team2: '-', court: 1, time: '1:20 - 1:40', isEmpty: true },
    { id: 'EMPTY', phase: 'Rest / Buffer', team1: '-', team2: '-', court: 3, time: '1:20 - 1:40', isEmpty: true },
  ];

  // Helper to draw a match box
  const MatchBox = ({ id, t1, t2, isTopSeed = false, isIronman = false }) => (
    <div className={`relative w-40 sm:w-48 bg-white border ${isIronman ? 'border-red-400 shadow-[0_0_10px_rgba(248,113,113,0.3)]' : 'border-slate-300'} rounded-md text-xs shadow-sm z-10 flex flex-col overflow-hidden`}>
      {isIronman && (
        <div className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full animate-pulse shadow-md z-20">
          <Flame size={12} />
        </div>
      )}
      <div className="bg-slate-100 text-[10px] font-bold text-slate-500 px-2 py-1 border-b border-slate-200 flex justify-between">
        <span>{id}</span>
      </div>
      <div className="flex flex-col">
        <div className={`px-2 py-1.5 border-b border-slate-100 font-semibold truncate ${isTopSeed ? 'text-indigo-700 bg-indigo-50/50' : 'text-slate-700'}`}>
          {t1}
        </div>
        <div className="px-2 py-1.5 font-semibold text-slate-700 truncate">
          {t2}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 sm:p-8 font-sans selection:bg-red-500/30">
      <div className="max-w-[1200px] mx-auto space-y-6">
        
        {/* Header Block */}
        <header className="mb-8 border-b border-slate-700 pb-6">
          <div className="flex items-center gap-3 mb-2">
            <Flame className="w-8 h-8 text-red-500" />
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              The "Ironman" 12-Team Knockout
            </h1>
          </div>
          <p className="text-slate-400 max-w-3xl">
            Squeezing a 12-team single elimination bracket into 100 minutes mathematically requires 11 matches perfectly interleaved across 3 courts. The catch? The top seeds get Byes, but advancing teams are subjected to <strong>"Ironman Matches"</strong>—forced to play back-to-back 20-minute games with zero rest.
          </p>
        </header>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-700 flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teams</span>
            <span className="text-2xl font-black text-white">12</span>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-700 flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Matches</span>
            <span className="text-2xl font-black text-white">11</span>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-700 flex flex-col justify-center relative overflow-hidden">
             <div className="absolute right-0 top-0 opacity-10"><Swords className="w-24 h-24 text-red-500 -mt-4 -mr-4"/></div>
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Zero-Rest Matches</span>
            <span className="text-2xl font-black text-white relative z-10">6</span>
          </div>
          <div className="bg-red-900/40 p-4 rounded-xl shadow-sm border border-red-800 flex flex-col justify-center">
            <span className="text-xs font-bold text-red-300 uppercase tracking-wider z-10">Time Required</span>
            <span className="text-2xl font-black text-white z-10">100 mins</span>
            <span className="text-[10px] text-red-200 font-medium z-10 mt-1">Maximum efficiency.</span>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex p-1 bg-slate-800 rounded-xl max-w-sm mb-6 border border-slate-700">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'timeline' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            <CalendarDays className="w-4 h-4" /> Court Timeline
          </button>
          <button
            onClick={() => setActiveTab('bracket')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'bracket' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Grid className="w-4 h-4" /> Bracket View
          </button>
        </div>

        {}
        {activeTab === 'bracket' && (
          <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 p-8 overflow-x-auto relative min-h-[600px]">
             <div className="mb-6 flex items-center gap-4 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 w-max">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  Red Outline = Ironman Match (0 Mins Rest)
                </span>
             </div>

             {/* 
                We use a highly customized Flex grid tailored specifically to the visual staggered 
                layout of a 12-team bracket where top seeds await the Round 1 winners. 
             */}
             <div className="flex items-center w-max min-w-full">
                
                {/* Column 1: Round 1 (4 matches staggered) */}
                <div className="flex flex-col gap-[72px] mr-12 py-12">
                   <MatchBox id="R1-M1" t1="Seed 8" t2="Seed 9" />
                   <MatchBox id="R1-M2" t1="Seed 5" t2="Seed 12" />
                   <MatchBox id="R1-M3" t1="Seed 6" t2="Seed 11" />
                   <MatchBox id="R1-M4" t1="Seed 7" t2="Seed 10" />
                </div>

                {/* Connecting Lines Col 1 to 2 */}
                <div className="flex flex-col gap-[72px] -ml-12 mr-12 py-12 pointer-events-none">
                  {[1,2,3,4].map(i => (
                     <div key={i} className="w-12 h-[68px] border-b-2 border-slate-600"></div>
                  ))}
                </div>

                {/* Column 2: Quarterfinals */}
                <div className="flex flex-col gap-[36px] mr-12">
                   <MatchBox id="QF-1" t1="Seed 1 (Bye)" t2="Winner R1-M1" isTopSeed isIronman />
                   <MatchBox id="QF-2" t1="Seed 4 (Bye)" t2="Winner R1-M2" isTopSeed isIronman />
                   <MatchBox id="QF-3" t1="Seed 3 (Bye)" t2="Winner R1-M3" isTopSeed />
                   <MatchBox id="QF-4" t1="Seed 2 (Bye)" t2="Winner R1-M4" isTopSeed isIronman />
                </div>

                {/* Connecting Lines Col 2 to 3 (Brackets) */}
                <div className="flex flex-col gap-[140px] -ml-12 mr-12 pointer-events-none">
                    <div className="w-12 h-[104px] border-t-2 border-b-2 border-r-2 border-slate-600 rounded-r-lg mt-[34px]"></div>
                    <div className="w-12 h-[104px] border-t-2 border-b-2 border-r-2 border-slate-600 rounded-r-lg"></div>
                </div>

                {/* Connecting feed lines to Semis */}
                <div className="flex flex-col gap-[244px] -ml-12 mr-12 pointer-events-none">
                    <div className="w-12 h-[2px] bg-slate-600 mt-[85px]"></div>
                    <div className="w-12 h-[2px] bg-slate-600"></div>
                </div>

                {/* Column 3: Semi-Finals */}
                <div className="flex flex-col gap-[178px] mr-12">
                   <MatchBox id="SF-1" t1="Winner QF-1" t2="Winner QF-2" />
                   <MatchBox id="SF-2" t1="Winner QF-3" t2="Winner QF-4" isIronman />
                </div>

                {/* Connecting Lines Col 3 to 4 (Final Bracket) */}
                <div className="flex flex-col -ml-12 mr-12 pointer-events-none">
                    <div className="w-12 h-[246px] border-t-2 border-b-2 border-r-2 border-slate-600 rounded-r-lg mt-[34px]"></div>
                </div>
                <div className="flex flex-col -ml-12 mr-12 pointer-events-none">
                    <div className="w-12 h-[2px] bg-slate-600"></div>
                </div>

                {/* Column 4: Grand Final */}
                <div className="flex flex-col relative">
                   <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-yellow-500 animate-bounce">
                     <Trophy size={32} />
                   </div>
                   <MatchBox id="FINAL" t1="Winner SF-1" t2="Winner SF-2" isIronman />
                </div>

             </div>
          </div>
        )}

        {}
        {activeTab === 'timeline' && (
          <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden animate-in fade-in duration-300">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">Time Window</th>
                    <th className="px-6 py-4 font-bold">Court</th>
                    <th className="px-6 py-4 font-bold">Match ID</th>
                    <th className="px-6 py-4 font-bold">Matchup</th>
                    <th className="px-6 py-4 font-bold">Ironman Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {timelineMatches.map((match, idx) => (
                    <tr 
                      key={idx} 
                      className={`transition-colors ${
                        match.isEmpty 
                          ? 'bg-slate-800/30' 
                          : match.ironman 
                            ? 'bg-red-900/10 hover:bg-red-900/20' 
                            : 'hover:bg-slate-750'
                      }`}
                    >
                      {/* Time */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`flex items-center gap-2 text-sm font-bold ${match.isEmpty ? 'text-slate-600' : 'text-slate-300'}`}>
                          <Clock className={`w-4 h-4 ${match.isEmpty ? 'opacity-50' : match.ironman ? 'text-red-400' : 'text-indigo-400'}`} />
                          {match.time}
                        </div>
                      </td>
                      
                      {/* Court */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          match.isEmpty
                            ? 'bg-slate-700/50 text-slate-500'
                            : 'bg-slate-700 text-slate-300'
                        }`}>
                          <MapPin className="w-3.5 h-3.5" />
                          Court {match.court}
                        </span>
                      </td>

                      {/* Match ID / Phase */}
                      <td className="px-6 py-4">
                        {!match.isEmpty ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-white uppercase">
                              {match.id}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider font-bold w-max text-slate-400">
                              {match.phase}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 font-medium">Empty Court</span>
                        )}
                      </td>

                      {/* Matchup */}
                      <td className="px-6 py-4">
                        {!match.isEmpty ? (
                          <div className="flex items-center gap-3 text-sm">
                            <span className="flex-1 font-medium text-right truncate w-[130px] text-slate-300">
                              {match.team1}
                            </span>
                            <span className="text-[10px] font-black text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">VS</span>
                            <span className="flex-1 font-medium truncate w-[130px] text-slate-300">
                              {match.team2}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-600">-</span>
                        )}
                      </td>

                      {/* Warning Column */}
                      <td className="px-6 py-4">
                        {match.ironman ? (
                          <div className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-950/50 px-3 py-1.5 rounded-lg border border-red-900 w-max animate-pulse">
                            <Flame className="w-4 h-4" />
                            {match.ironmanMsg}
                          </div>
                        ) : match.msg ? (
                          <span className="text-xs text-slate-400 font-medium italic">{match.msg}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-900 border-t border-slate-700 p-5">
              <p className="text-sm text-slate-400 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white block mb-1">The Cost of Efficiency:</strong> 
                  As shown in the timeline above, a 12-team knockout perfectly consumes 100 minutes of court time, but it forces 6 out of 11 matches to be played under "Ironman" conditions. Teams that win their match must immediately transition to their next bracket match with 0 minutes of rest. Because of the bracket geometry, the team that advances from the bottom half of the bracket (QF-4 &rarr; SF-2) is forced to play 3 back-to-back 20 minute matches to reach the finals!
                </span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}