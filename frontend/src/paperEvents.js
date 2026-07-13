export const PAPER_TAGS_UPDATED_EVENT = 'paper-tracker:paper-tags-updated'

export function notifyPaperTagsUpdated(paperId, tagRecords) {
  window.dispatchEvent(new CustomEvent(PAPER_TAGS_UPDATED_EVENT, {
    detail: {
      paperId,
      tags: tagRecords.map((tag) => tag.name).join(', '),
      tagRecords,
    },
  }))
}
