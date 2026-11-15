export interface AlertAction {
  label: string;
  run: () => void;
}

/** A yellow message bar with optional action buttons. */
export interface AlertMessage {
  message: string;
  actions: AlertAction[];
}

export interface StatusMessage {
  text: string;
  error?: boolean;
}
