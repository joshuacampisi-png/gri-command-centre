import React, { useEffect } from 'react';

export default function Toast({ toast, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  return (
    <div className={`toast toast-${toast.kind}`} role="status">
      {toast.message}
    </div>
  );
}
