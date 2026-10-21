/**
 * Safely navigates back if history exists, otherwise navigates to fallback path.
 * Prevents "The action 'GO_BACK' was not handled by any navigator" error.
 */
export interface NavRouter {
  canGoBack?: () => boolean;
  back?: () => void;
  replace?: (href: any, ...args: any[]) => void;
}

export function safeGoBack(router: NavRouter | null | undefined, fallback: string = '/(tabs)/dashboard') {
  try {
    if (router && typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back?.();
    } else if (router && typeof router.replace === 'function') {
      router.replace(fallback);
    }
  } catch (_e) {
    try {
      if (router && typeof router.replace === 'function') {
        router.replace(fallback);
      }
    } catch {
      // Intended ignore: Navigation action failed because navigator unmounted or state is resetting
    }
  }
}

