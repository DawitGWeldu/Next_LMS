"use client";
import {AICC, Scorm12API, Scorm2004API} from 'scorm-again'; // you only do this if you're using the package manager

// Extend Window interface to include SCORM API objects
declare global {
  interface Window {
    Scorm12API?: any;
    Scorm2004API?: any;
    SCORM?: any;
    API?: any;
    API_1484_11?: any;
  }
}

/**
 * Supported SCORM versions
 */
export enum ScormVersion {
  SCORM_12 = '1.2',
  SCORM_2004 = '2004'
}

/**
 * SCORM API initialization options
 */
export interface ScormApiOptions {
  version: ScormVersion;
  createAPIImmediately?: boolean;
  autocommit?: boolean;
  autocommitSeconds?: number;
  dataCommitFormat?: 'json' | 'params' | 'flattened';
  commitRequestDelay?: number;
  lmsCommitUrl?: string;
  lmsGetDataUrl?: string;
  alwaysSendTotalTime?: boolean;
  connectionInitialized?: () => void;
  connectionTerminated?: () => void;
  onLogMessage?: (message: string, type: string) => void;
  masteryScore?: number;
  logLevel?: 1 | 2 | 3 | 4 | 5; // DEBUG, INFO, WARN, ERROR, NONE
}

/**
 * SCORM Data Model Element types
 */
export type ScormDataModelKey = string;
export type ScormDataModelValue = string | number | boolean;

/**
 * SCORM API event types
 */
export enum ScormApiEvent {
  LMSInitialize = 'lmsInitialize',
  LMSFinish = 'lmsFinish',
  LMSGetValue = 'lmsGetValue',
  LMSSetValue = 'lmsSetValue',
  LMSCommit = 'lmsCommit',
  LMSGetLastError = 'lmsGetLastError',
  LMSGetErrorString = 'lmsGetErrorString',
  LMSGetDiagnostic = 'lmsGetDiagnostic',
  SequencingRequest = 'sequencingRequest', // New event for SCORM 2004 sequencing
}

/**
 * SCORM API event handler
 */
export type ScormApiEventHandler = (event: {
  type: ScormApiEvent;
  key?: ScormDataModelKey;
  value?: ScormDataModelValue;
  error?: any;
  result?: any;
}) => void;

/**
 * SCORM API status
 */
export enum ScormApiStatus {
  NOT_INITIALIZED = 'notInitialized',
  INITIALIZED = 'initialized',
  TERMINATED = 'terminated',
  ERROR = 'error'
}

/**
 * SCORM 2004 Navigation Commands
 */
export enum Scorm2004NavigationCommand {
  CONTINUE = 'continue',
  PREVIOUS = 'previous',
  CHOICE = 'choice',
  EXIT = 'exit',
  EXITALL = 'exitAll',
  ABANDON = 'abandon',
  ABANDONALL = 'abandonAll',
  SUSPENDALL = 'suspendAll',
  NONE = ''
}

/**
 * SCORM API wrapper for SCORM 1.2 and 2004 using scorm-again
 */
class ScormApi {
  private scorm: any = null;
  private eventHandlers: Map<ScormApiEvent, ScormApiEventHandler[]> = new Map();
  private status: ScormApiStatus = ScormApiStatus.NOT_INITIALIZED;
  private version: ScormVersion = ScormVersion.SCORM_12;
  private options: ScormApiOptions | null = null;
  
  /**
   * Ensure the SCORM-again library is loaded and the appropriate API object is exposed in the window
   * Based on the SCORM specification requirements and scorm-again documentation.
   * @param version The SCORM version to use (optional, defaults to the current version if set)
   */
  public ensureScormLoaded(version?: ScormVersion): Promise<boolean> {
    return new Promise((resolve) => {
      // If version is provided, update the current version
      if (version) {
        this.version = version;
      }
      
      // First check if we've already successfully loaded the API objects
      if (
        (this.version === ScormVersion.SCORM_12 && window.API) || 
        (this.version === ScormVersion.SCORM_2004 && window.API_1484_11)
      ) {
        console.log('SCORM API already available in window');
        resolve(true);
        return;
      }
      
      try {
        console.log('Setting up SCORM API using scorm-again library');
        
        // Create the appropriate API object but don't initialize it yet
        // The SCORM content will call Initialize/LMSInitialize itself
        if (this.version === ScormVersion.SCORM_12) {
          if (!window.API) {
            console.log('Creating SCORM 1.2 API object in window.API');
            // Just expose the API - don't initialize it
            // The content will call LMSInitialize
            window.API = new Scorm12API({
              autocommit: true,
              logLevel: 4 // ERROR level
            });
            console.log('SCORM 1.2 API created and exposed in window.API');
          } else {
            console.log('SCORM 1.2 API already exists in window.API');
          }
        } else if (this.version === ScormVersion.SCORM_2004) {
          if (!window.API_1484_11) {
            console.log('Creating SCORM 2004 API object in window.API_1484_11');
            // Just expose the API - don't initialize it
            // The content will call Initialize
            window.API_1484_11 = new Scorm2004API({
              autocommit: true,
              logLevel: 4 // ERROR level
            });
            console.log('SCORM 2004 API created and exposed in window.API_1484_11');
          } else {
            console.log('SCORM 2004 API already exists in window.API_1484_11');
          }
        } else {
          console.error(`Unsupported SCORM version: ${this.version}`);
          resolve(false);
          return;
        }
        
        resolve(true);
      } catch (error) {
        console.error('Error setting up SCORM API:', error);
        resolve(false);
      }
    });
  }
  
  /**
   * Initialize the SCORM API
   * @param options SCORM API initialization options
   * @returns true if initialization was successful
   */
  public initialize(options: ScormApiOptions): boolean {
    if (this.status === ScormApiStatus.INITIALIZED) {
      console.warn('SCORM API already initialized');
      return true;
    }
    
    this.options = options;
    this.version = options.version;
    
    console.log(`Initializing SCORM API with version: ${this.version}`);
    
    try {
      // In SCORM, the content calls Initialize/LMSInitialize on the API object,
      // so our job is to make sure the API object is available in the window
      if (typeof window !== 'undefined') {
        // Store the reference to the API object that was created in ensureScormLoaded
        if (this.version === ScormVersion.SCORM_12 && window.API) {
          this.scorm = window.API;
          this.status = ScormApiStatus.INITIALIZED;
          
          console.log('Using existing SCORM 1.2 API from window.API');
          
          // Set up our event handlers for the API object
          this.setupEventHandlers(options);
          
          return true;
        } else if (this.version === ScormVersion.SCORM_2004 && window.API_1484_11) {
          this.scorm = window.API_1484_11;
          this.status = ScormApiStatus.INITIALIZED;
          
          console.log('Using existing SCORM 2004 API from window.API_1484_11');
          
          // Set up our event handlers for the API object
          this.setupEventHandlers(options);
          
          return true;
        } else {
          console.error(`Required SCORM API not found in window for version ${this.version}`);
          this.status = ScormApiStatus.ERROR;
          return false;
        }
      } else {
        console.error('Not in browser environment, SCORM API cannot be initialized');
        this.status = ScormApiStatus.ERROR;
        return false;
      }
    } catch (error) {
      console.error('Error initializing SCORM API:', error);
      this.status = ScormApiStatus.ERROR;
      return false;
    }
  }
  
  /**
   * Set up event handlers for the SCORM API
   * @param options SCORM API options containing event handlers
   */
  private setupEventHandlers(options: ScormApiOptions): void {
    if (!this.scorm) return;
    
    // Add event listeners for SCORM API initialization and termination
    if (options.connectionInitialized) {
      const eventName = this.version === ScormVersion.SCORM_12 ? 'LMSInitialize' : 'Initialize';
      this.scorm.on(eventName, options.connectionInitialized);
    }
    
    if (options.connectionTerminated) {
      const eventName = this.version === ScormVersion.SCORM_12 ? 'LMSFinish' : 'Terminate';
      this.scorm.on(eventName, options.connectionTerminated);
    }
    
    if (options.onLogMessage) {
      this.scorm.on('logMessage', ({ message, category }: any) => {
        options.onLogMessage?.(message, category);
      });
    }
    
    // Dispatch initialize event
    this.dispatchEvent(ScormApiEvent.LMSInitialize, { result: true });
  }
  
  /**
   * Terminate the SCORM API connection
   * @returns true if termination was successful
   */
  public terminate(): boolean {
    if (this.status !== ScormApiStatus.INITIALIZED) {
      console.warn('SCORM API not initialized');
      return false;
    }
    
    try {
      // For SCORM 2004, make sure we update the session time
      if (this.version === ScormVersion.SCORM_2004) {
        this.updateSessionTime();
      }
      
      const success = this.scorm.terminate();
      
      if (success) {
        this.status = ScormApiStatus.TERMINATED;
        this.dispatchEvent(ScormApiEvent.LMSFinish, { result: true });
      } else {
        console.error('Failed to terminate SCORM API:', this.getLastError());
      }
      
      return success;
    } catch (error) {
      console.error('Error terminating SCORM API:', error);
      return false;
    }
  }
  
  /**
   * Get the value of a SCORM data model element
   * @param key SCORM data model element name
   * @returns value of the SCORM data model element or null if not found
   */
  public getValue(key: ScormDataModelKey): string | null {
    if (this.status !== ScormApiStatus.INITIALIZED) {
      console.warn('SCORM API not initialized');
      return null;
    }
    
    try {
      const value = this.scorm.getvalue(key);
      this.dispatchEvent(ScormApiEvent.LMSGetValue, { key, result: value });
      return value;
    } catch (error) {
      console.error(`Error getting SCORM value for ${key}:`, error);
      this.dispatchEvent(ScormApiEvent.LMSGetValue, { key, error });
      return null;
    }
  }
  
  /**
   * Set the value of a SCORM data model element
   * @param key SCORM data model element name
   * @param value value to set
   * @returns true if the value was set successfully
   */
  public setValue(key: ScormDataModelKey, value: ScormDataModelValue): boolean {
    if (this.status !== ScormApiStatus.INITIALIZED) {
      console.warn('SCORM API not initialized');
      return false;
    }
    
    try {
      const success = this.scorm.setvalue(key, value);
      this.dispatchEvent(ScormApiEvent.LMSSetValue, { key, value, result: success });
      return success;
    } catch (error) {
      console.error(`Error setting SCORM value for ${key}:`, error);
      this.dispatchEvent(ScormApiEvent.LMSSetValue, { key, value, error });
      return false;
    }
  }
  
  /**
   * Commit changes to the LMS
   * @returns true if commit was successful
   */
  public commit(): boolean {
    if (this.status !== ScormApiStatus.INITIALIZED) {
      console.warn('SCORM API not initialized');
      return false;
    }
    
    try {
      // For SCORM 2004, update session time before commit
      if (this.version === ScormVersion.SCORM_2004) {
        this.updateSessionTime();
      }
      
      const success = this.scorm.commit();
      this.dispatchEvent(ScormApiEvent.LMSCommit, { result: success });
      return success;
    } catch (error) {
      console.error('Error committing SCORM data:', error);
      this.dispatchEvent(ScormApiEvent.LMSCommit, { error });
      return false;
    }
  }
  
  /**
   * Get the last error code from the SCORM API
   * @returns error code
   */
  public getLastError(): string {
    if (!this.scorm) {
      return 'SCORM API not initialized';
    }
    
    try {
      const errorCode = this.scorm.getLastError();
      this.dispatchEvent(ScormApiEvent.LMSGetLastError, { result: errorCode });
      return errorCode;
    } catch (error) {
      console.error('Error getting last SCORM error:', error);
      return 'Unknown error';
    }
  }
  
  /**
   * Get the error string for the last error
   * @returns error string
   */
  public getErrorString(errorCode?: string): string {
    if (!this.scorm) {
      return 'SCORM API not initialized';
    }
    
    try {
      const errorString = errorCode 
        ? this.scorm.getErrorString(errorCode) 
        : this.scorm.getErrorString(this.scorm.getLastError());
      
      this.dispatchEvent(ScormApiEvent.LMSGetErrorString, { result: errorString });
      return errorString;
    } catch (error) {
      console.error('Error getting SCORM error string:', error);
      return 'Unknown error';
    }
  }
  
  /**
   * Get diagnostic information for the last error
   * @returns diagnostic information
   */
  public getDiagnostic(errorCode?: string): string {
    if (!this.scorm) {
      return 'SCORM API not initialized';
    }
    
    try {
      const diagnostic = errorCode
        ? this.scorm.getDiagnostic(errorCode)
        : this.scorm.getDiagnostic(this.scorm.getLastError());
      
      this.dispatchEvent(ScormApiEvent.LMSGetDiagnostic, { result: diagnostic });
      return diagnostic;
    } catch (error) {
      console.error('Error getting SCORM diagnostic:', error);
      return 'Unknown error';
    }
  }
  
  /**
   * Add an event listener for SCORM API events
   * @param event SCORM API event type
   * @param handler event handler function
   */
  public addEventListener(event: ScormApiEvent, handler: ScormApiEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    
    this.eventHandlers.get(event)?.push(handler);
  }
  
  /**
   * Remove an event listener for SCORM API events
   * @param event SCORM API event type
   * @param handler event handler function to remove
   */
  public removeEventListener(event: ScormApiEvent, handler: ScormApiEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      return;
    }
    
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      this.eventHandlers.set(
        event,
        handlers.filter(h => h !== handler)
      );
    }
  }
  
  /**
   * Dispatch an event to all registered handlers
   * @param event SCORM API event type
   * @param data event data
   */
  private dispatchEvent(event: ScormApiEvent, data: any): void {
    const handlers = this.eventHandlers.get(event);
    
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler({ type: event, ...data });
        } catch (error) {
          console.error(`Error in SCORM API event handler for ${event}:`, error);
        }
      });
    }
  }
  
  /**
   * Get the current status of the SCORM API
   * @returns current status
   */
  public getStatus(): ScormApiStatus {
    return this.status;
  }
  
  /**
   * Check if the SCORM API is initialized
   * @returns true if initialized
   */
  public isInitialized(): boolean {
    return this.status === ScormApiStatus.INITIALIZED;
  }
  
  /**
   * Get the current SCORM version
   * @returns current SCORM version
   */
  public getVersion(): ScormVersion {
    return this.version;
  }
  
  /**
   * Set common completion status based on SCORM version
   * @param status completion status (completed, incomplete, not attempted, passed, failed)
   * @returns true if status was set successfully
   */
  public setCompletionStatus(
    status: 'completed' | 'incomplete' | 'not attempted' | 'passed' | 'failed'
  ): boolean {
    if (this.version === ScormVersion.SCORM_12) {
      // SCORM 1.2 uses separate fields for completion and success status
      if (status === 'passed' || status === 'failed') {
        return this.setValue('cmi.core.lesson_status', status);
      } else {
        return this.setValue('cmi.core.lesson_status', status);
      }
    } else {
      // SCORM 2004 separates completion and success status
      if (status === 'passed') {
        return this.setValue('cmi.completion_status', 'completed') 
          && this.setValue('cmi.success_status', 'passed');
      } else if (status === 'failed') {
        return this.setValue('cmi.success_status', 'failed');
      } else if (status === 'not attempted') {
        return this.setValue('cmi.completion_status', 'not attempted');
      } else {
        return this.setValue('cmi.completion_status', status);
      }
    }
  }
  
  /**
   * Get the completion status based on SCORM version
   * @returns completion status
   */
  public getCompletionStatus(): string | null {
    if (this.version === ScormVersion.SCORM_12) {
      return this.getValue('cmi.core.lesson_status');
    } else {
      return this.getValue('cmi.completion_status');
    }
  }
  
  /**
   * Get the success status (SCORM 2004 only)
   * @returns success status or null for SCORM 1.2
   */
  public getSuccessStatus(): string | null {
    if (this.version === ScormVersion.SCORM_12) {
      // SCORM 1.2 doesn't separate success and completion status
      const status = this.getValue('cmi.core.lesson_status');
      // Only return passed/failed, not completion states
      return status === 'passed' || status === 'failed' ? status : null;
    } else {
      return this.getValue('cmi.success_status');
    }
  }
  
  /**
   * Set the score for the SCORM content
   * @param score score to set (0-100)
   * @returns true if score was set successfully
   */
  public setScore(score: number): boolean {
    if (score < 0 || score > 100) {
      console.error('Score must be between 0 and 100');
      return false;
    }
    
    if (this.version === ScormVersion.SCORM_12) {
      // SCORM 1.2 uses a raw score out of 100
      return this.setValue('cmi.core.score.raw', score);
    } else {
      // SCORM 2004 uses both raw score and scaled score (0-1)
      const scaled = score / 100;
      return this.setValue('cmi.score.raw', score) && 
             this.setValue('cmi.score.scaled', scaled);
    }
  }
  
  /**
   * Get the score from the SCORM content
   * @returns score (0-100) or null if not set
   */
  public getScore(): number | null {
    let score: string | null;
    
    if (this.version === ScormVersion.SCORM_12) {
      score = this.getValue('cmi.core.score.raw');
    } else {
      score = this.getValue('cmi.score.raw');
      
      // Try scaled score if raw score is not available
      if (!score) {
        const scaled = this.getValue('cmi.score.scaled');
        if (scaled !== null) {
          return parseFloat(scaled) * 100;
        }
      }
    }
    
    return score !== null ? parseFloat(score) : null;
  }
  
  /**
   * Make a sequencing request (SCORM 2004 only)
   * @param command The navigation request command
   * @param targetId Optional target identifier for choice navigation
   * @returns true if the request was successful
   */
  public requestSequencing(command: Scorm2004NavigationCommand, targetId?: string): boolean {
    if (this.version !== ScormVersion.SCORM_2004) {
      console.warn('Sequencing requests are only available in SCORM 2004');
      return false;
    }
    
    if (this.status !== ScormApiStatus.INITIALIZED) {
      console.warn('SCORM API not initialized');
      return false;
    }
    
    try {
      // Set the navigation request
      let success = this.setValue('adl.nav.request', command);
      
      // Set the target parameter if provided for choice navigation
      if (command === Scorm2004NavigationCommand.CHOICE && targetId) {
        success = success && this.setValue('adl.nav.request_valid.target', targetId);
      }
      
      // Dispatch event
      this.dispatchEvent(ScormApiEvent.SequencingRequest, { 
        result: success, 
        command,
        targetId
      });
      
      return success;
    } catch (error) {
      console.error('Error making sequencing request:', error);
      this.dispatchEvent(ScormApiEvent.SequencingRequest, { error });
      return false;
    }
  }
  
  /**
   * Check if a navigation request is valid in the current state (SCORM 2004 only)
   * @param command The navigation command to validate
   * @param targetId Optional target identifier for choice navigation
   * @returns true if the navigation request is valid
   */
  public isNavigationValid(command: Scorm2004NavigationCommand, targetId?: string): boolean {
    if (this.version !== ScormVersion.SCORM_2004) {
      // Always allow navigation for SCORM 1.2
      return true;
    }
    
    if (this.status !== ScormApiStatus.INITIALIZED) {
      console.warn('SCORM API not initialized');
      return false;
    }
    
    try {
      let validKey: string;
      
      // Select the appropriate validity check based on the command
      switch (command) {
        case Scorm2004NavigationCommand.CONTINUE:
          validKey = 'adl.nav.request_valid.continue';
          break;
        case Scorm2004NavigationCommand.PREVIOUS:
          validKey = 'adl.nav.request_valid.previous';
          break;
        case Scorm2004NavigationCommand.CHOICE:
          if (!targetId) {
            console.error('Target ID is required for choice navigation');
            return false;
          }
          // Set the target, then check if the choice is valid
          this.setValue('adl.nav.request_valid.target', targetId);
          validKey = 'adl.nav.request_valid.choice';
          break;
        case Scorm2004NavigationCommand.EXIT:
          validKey = 'adl.nav.request_valid.exit';
          break;
        case Scorm2004NavigationCommand.EXITALL:
          validKey = 'adl.nav.request_valid.exitAll';
          break;
        case Scorm2004NavigationCommand.ABANDON:
          validKey = 'adl.nav.request_valid.abandon';
          break;
        case Scorm2004NavigationCommand.ABANDONALL:
          validKey = 'adl.nav.request_valid.abandonAll';
          break;
        case Scorm2004NavigationCommand.SUSPENDALL:
          validKey = 'adl.nav.request_valid.suspendAll';
          break;
        default:
          console.error('Invalid navigation command');
          return false;
      }
      
      // Get the validity value
      const valid = this.getValue(validKey);
      return valid === 'true' || valid === 'yes' || valid === '1';
      
    } catch (error) {
      console.error('Error checking navigation validity:', error);
      return false;
    }
  }
  
  /**
   * Update the session time (SCORM 2004 only)
   * This is called automatically on commit and terminate
   */
  private updateSessionTime(): void {
    if (this.version !== ScormVersion.SCORM_2004) {
      return;
    }
    
    try {
      // Get the session start time
      const sessionStartTime = this.scorm.getSessionStartTime();
      if (!sessionStartTime) return;
      
      // Calculate time elapsed since start
      const now = new Date();
      const elapsedMilliseconds = now.getTime() - sessionStartTime.getTime();
      
      // Format as ISO 8601 duration PTxHxMxS (required by SCORM 2004)
      const hours = Math.floor(elapsedMilliseconds / 3600000);
      const minutes = Math.floor((elapsedMilliseconds % 3600000) / 60000);
      const seconds = Math.floor((elapsedMilliseconds % 60000) / 1000);
      
      const formattedTime = `PT${hours}H${minutes}M${seconds}S`;
      
      // Set the session time
      this.setValue('cmi.session_time', formattedTime);
    } catch (error) {
      console.error('Error updating session time:', error);
    }
  }
  
  /**
   * Set a SCORM 2004 interaction
   * @param index The interaction index
   * @param interaction The interaction data
   * @returns true if the interaction was set successfully
   */
  public setInteraction(index: number, interaction: {
    id: string;
    type: 'true-false' | 'choice' | 'fill-in' | 'long-fill-in' | 'matching' | 'performance' | 'sequencing' | 'likert' | 'numeric';
    learnerResponse: string;
    result?: 'correct' | 'incorrect' | 'neutral' | string;
    description?: string;
    timestamp?: Date;
    weighting?: number;
    latency?: string; // Format as ISO 8601 duration
  }): boolean {
    if (this.status !== ScormApiStatus.INITIALIZED) {
      console.warn('SCORM API not initialized');
      return false;
    }
    
    try {
      const prefix = this.version === ScormVersion.SCORM_12 
        ? `cmi.interactions.${index}` 
        : `cmi.interactions.${index}`;
      
      // Set common fields
      let success = this.setValue(`${prefix}.id`, interaction.id);
      success = success && this.setValue(`${prefix}.type`, interaction.type);
      
      // Set response
      const responseKey = this.version === ScormVersion.SCORM_12 
        ? `${prefix}.student_response` 
        : `${prefix}.learner_response`;
      success = success && this.setValue(responseKey, interaction.learnerResponse);
      
      // Set result if provided
      if (interaction.result !== undefined) {
        success = success && this.setValue(`${prefix}.result`, interaction.result);
      }
      
      // SCORM 2004 specific fields
      if (this.version === ScormVersion.SCORM_2004) {
        // Set description if provided
        if (interaction.description) {
          success = success && this.setValue(`${prefix}.description`, interaction.description);
        }
        
        // Set timestamp if provided
        if (interaction.timestamp) {
          const isoTime = interaction.timestamp.toISOString();
          success = success && this.setValue(`${prefix}.timestamp`, isoTime);
        }
        
        // Set weighting if provided
        if (interaction.weighting !== undefined) {
          success = success && this.setValue(`${prefix}.weighting`, interaction.weighting);
        }
        
        // Set latency if provided
        if (interaction.latency) {
          success = success && this.setValue(`${prefix}.latency`, interaction.latency);
        }
      }
      
      return success;
    } catch (error) {
      console.error('Error setting interaction:', error);
      return false;
    }
  }
}

// Create a singleton instance
const scormApi = new ScormApi();

export default scormApi; 