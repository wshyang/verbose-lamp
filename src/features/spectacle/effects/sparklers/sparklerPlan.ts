/**
 * Sparkler-transition timeline. The choreography (flash, flight arcs,
 * collision) is the plan proven under the old "orb" name in ADDENDUM-020/024;
 * ADDENDUM-025 renames the effect for what it depicts — party sparklers — and
 * keeps the orb names as compatibility aliases so existing callers keep
 * working. This module is the sparkler spelling of that same pure plan.
 */
export {
  planOrbCrossfade as planSparklerCrossfade,
  planOrbTransition as planSparklerTransition,
  type OrbPlan as SparklerPlan,
  type OrbTrack as SparklerTrack,
} from '../orbs/orbPlan';
