import type { UserRole } from '../../api/types'
import { FALLBACK, TOPICS, type BotReply, type Topic } from './knowledge'

const SHORT_TALK = new Set(['greeting', 'thanks'])
const MIN_SCORE = 2
const MAX_QUESTION_LENGTH = 300

/** Lower case, punctuation removed, single spaces: "How do I apply?!" -> "how do i apply". */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsPhrase(question: string, phrase: string): boolean {
  // Whole words only, so "hi" does not match "this" and "cv" does not match "cvs" by accident.
  return ` ${question} `.includes(` ${phrase} `)
}

function scoreTopic(topic: Topic, question: string, role: UserRole | undefined): number {
  const wordCount = question.split(' ').length
  if (SHORT_TALK.has(topic.id) && wordCount > 4) return 0
  let score = 0
  for (const keyword of topic.keywords) {
    const phrase = normalise(keyword)
    if (containsPhrase(question, phrase)) score += phrase.split(' ').length * 2
  }
  if (score > 0 && role && topic.roles?.includes(role)) score += 1
  return score
}

/** The best scripted answer for a question. No network, no learning: keyword scoring only. */
export function answer(rawQuestion: string, role: UserRole | undefined): BotReply {
  const question = normalise(rawQuestion.slice(0, MAX_QUESTION_LENGTH))
  if (!question) return FALLBACK

  let best: { topic: Topic; score: number } | null = null
  for (const topic of TOPICS) {
    const score = scoreTopic(topic, question, role)
    if (score >= MIN_SCORE && (!best || score > best.score)) best = { topic, score }
  }
  return best ? best.topic.reply(role) : FALLBACK
}
