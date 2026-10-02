"use client";

import { deleteCourse } from "../actions";

export default function DeleteCourseButton({ courseId, courseName }: { courseId: string; courseName: string }) {
  return (
    <button
      type="button"
      className="text-xs text-red-600 dark:text-red-400 hover:underline"
      onClick={() => {
        if (confirm(`Delete "${courseName}"? This can't be undone.`)) {
          deleteCourse(courseId).catch((err) => {
            alert(err instanceof Error ? err.message : "Couldn't delete course.");
          });
        }
      }}
    >
      Delete
    </button>
  );
}
