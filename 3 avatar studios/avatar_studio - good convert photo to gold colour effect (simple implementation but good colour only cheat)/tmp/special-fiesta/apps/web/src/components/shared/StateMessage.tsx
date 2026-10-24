/**
 * Loading / error / empty are three states every list surface has. Rendering them through one
 * component keeps the FDS §8.4 empty-state copy visible and consistent.
 */
export function StateMessage(props: {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyText: string;
  testId: string;
}) {
  if (props.isLoading) {
    return (
      <p className="loading" data-testid={`${props.testId}__loading`}>
        Loading…
      </p>
    );
  }
  if (props.error) {
    return (
      <p className="error-text" data-testid={`${props.testId}__error`} role="alert">
        {props.error}
      </p>
    );
  }
  if (props.isEmpty) {
    return (
      <p className="empty-state" data-testid={`${props.testId}__empty`}>
        {props.emptyText}
      </p>
    );
  }
  return null;
}
