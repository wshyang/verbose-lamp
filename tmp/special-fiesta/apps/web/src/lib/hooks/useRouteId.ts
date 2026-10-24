import { useParams } from 'react-router-dom';

/**
 * React Router types every path parameter as optional, even the ones the route table always
 * supplies. Narrowing it here keeps each page free of a fallback it can never exercise, and
 * an empty id simply makes the page report "not found" from the API answer.
 */
export function useRouteId(name: string): string {
  return useParams()[name] ?? '';
}
