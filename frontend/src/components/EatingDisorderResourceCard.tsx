import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'edResourceDismissed'

/** A calm, one-time, non-nagging card -- never shown again once dismissed,
 * regardless of how many more times the trigger condition recurs. No
 * alarming language or styling; this is a gentle offer of a resource, not
 * a warning. */
export function EatingDisorderResourceCard() {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true')
    } catch {
      setDismissed(false)
    }
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // ignore -- worst case the card reappears next session
    }
  }

  if (dismissed) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <p className="text-sm">
        Support is available if food or eating ever feels stressful. The National Alliance for Eating Disorders offers
        a free, confidential helpline staffed by licensed therapists.
      </p>
      <div className="flex items-center gap-3">
        <a href="tel:8666621235" className="text-sm font-medium text-blue-600 underline dark:text-blue-400">
          Call 866-662-1235
        </a>
        <a
          href="https://www.allianceforeatingdisorders.com/"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-blue-600 underline dark:text-blue-400"
        >
          allianceforeatingdisorders.com
        </a>
        <button onClick={dismiss} className="ml-auto text-sm text-neutral-500 underline">
          Dismiss
        </button>
      </div>
    </div>
  )
}
