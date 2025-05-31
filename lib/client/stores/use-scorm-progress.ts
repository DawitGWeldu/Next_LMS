"use client";

import { create } from "zustand";
import { ProgressInfo } from "../service-worker-registry";

/**
 * Interface for progress information stored in the state
 */
export interface ScormProgressInfo extends ProgressInfo {
  // Last time this progress was updated
  lastUpdated: number;
  // Last time this progress was logged
  lastLogged?: number;
}

/**
 * Interface for the SCORM progress store
 */
interface ScormProgressState {
  // Progress information indexed by package key
  progress: Record<string, ScormProgressInfo>;
  // Threshold for progress updates (default: 2%)
  progressThreshold: number;
  // Threshold for time-based updates (default: 250ms)
  timeThreshold: number;
  // Threshold for log updates (default: 5%)
  logThreshold: number;
  // Threshold for time-based log updates (default: 1000ms)
  logTimeThreshold: number;
  
  // Action to update progress for a specific package
  updateProgress: (key: string, info: ProgressInfo) => void;
  // Action to clear progress for a specific package
  clearProgress: (key: string) => void;
  // Action to clear all progress
  clearAllProgress: () => void;
  // Action to update threshold values
  setThresholds: (params: {
    progressThreshold?: number;
    timeThreshold?: number;
    logThreshold?: number;
    logTimeThreshold?: number;
  }) => void;
}

/**
 * Zustand store for tracking SCORM package download and extraction progress
 */
export const useScormProgress = create<ScormProgressState>((set, get) => ({
  // Initial state
  progress: {},
  progressThreshold: 0.02, // 2%
  timeThreshold: 250, // 250ms
  logThreshold: 0.05, // 5%
  logTimeThreshold: 1000, // 1000ms
  
  /**
   * Update progress for a specific package
   * @param key Package key
   * @param info Progress information
   */
  updateProgress: (key: string, info: ProgressInfo) => {
    const state = get();
    const currentProgress = state.progress[key];
    const now = Date.now();
    
    // Check if we should update based on thresholds
    const shouldUpdate = 
      // First update for this package
      !currentProgress ||
      // Always update for non-download stages
      (info.stage && info.stage !== 'download') ||
      // Always update for stage changes
      (currentProgress.stage !== info.stage) ||
      // Update based on significant progress change
      (Math.abs((info.progress || 0) - (currentProgress.progress || 0)) >= state.progressThreshold) ||
      // Update based on time threshold
      ((now - currentProgress.lastUpdated) >= state.timeThreshold);
    
    // Only update if needed
    if (shouldUpdate) {
      // Determine if we should log this update
      const shouldLog =
        // Always log for non-download stages or stage changes
        (info.stage && info.stage !== 'download') ||
        (currentProgress && currentProgress.stage !== info.stage) ||
        // Log based on significant progress change
        !currentProgress || 
        Math.abs((info.progress || 0) - (currentProgress.progress || 0)) >= state.logThreshold ||
        // Log based on time threshold (if last logged time exists)
        (currentProgress.lastLogged && (now - currentProgress.lastLogged) >= state.logTimeThreshold);
      
      // Update the store
      set((state) => ({
        progress: {
          ...state.progress,
          [key]: {
            ...info,
            lastUpdated: now,
            lastLogged: shouldLog ? now : currentProgress?.lastLogged,
          },
        },
      }));
      
      // Log if needed
      if (shouldLog) {
        const progressPercent = Math.round((info.progress || 0) * 100);
        console.log(
          `[Progress Store] ${key}: ${progressPercent}%, stage: ${info.stage || 'unknown'}, ` +
          `files: ${info.processedFiles || 0}/${info.fileCount || '?'}, ` +
          `elapsed: ${info.elapsedTime || 0}ms`
        );
      }
    }
  },
  
  /**
   * Clear progress for a specific package
   * @param key Package key
   */
  clearProgress: (key: string) => {
    set((state) => {
      const newProgress = { ...state.progress };
      delete newProgress[key];
      return { progress: newProgress };
    });
  },
  
  /**
   * Clear all progress
   */
  clearAllProgress: () => {
    set({ progress: {} });
  },
  
  /**
   * Update threshold values
   * @param params Threshold parameters to update
   */
  setThresholds: (params) => {
    set((state) => ({
      progressThreshold: params.progressThreshold ?? state.progressThreshold,
      timeThreshold: params.timeThreshold ?? state.timeThreshold,
      logThreshold: params.logThreshold ?? state.logThreshold,
      logTimeThreshold: params.logTimeThreshold ?? state.logTimeThreshold,
    }));
  },
}));

/**
 * Get progress for a specific package
 * @param key Package key
 * @returns Progress information or undefined if not found
 */
export const getProgressForKey = (key: string): ScormProgressInfo | undefined => {
  return useScormProgress.getState().progress[key];
};

/**
 * Helper hook to subscribe to progress for a specific package
 * @param key Package key
 * @returns Progress information or undefined if not found
 */
export const usePackageProgress = (key: string) => {
  return useScormProgress((state) => state.progress[key]);
}; 