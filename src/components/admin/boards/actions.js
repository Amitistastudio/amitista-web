import React from 'react';
import {
  addCardLink,
  addCardStep,
  attachCardFile,
  askBoardMember,
  bulkCards,
  cancelBoardAsk,
  commentOnCard,
  createBoardList,
  createCard,
  deleteBoardLabel,
  deleteBoardList,
  deleteCard,
  deleteCardComment,
  deleteCardFile,
  deleteCardLink,
  deleteCardStep,
  duplicateCard,
  moveBoardList,
  moveCard,
  deleteBoardArt,
  placeBoardArt,
  removeBoardMember,
  setBoardArt,
  setBoardLabel,
  setBoardMember,
  setBoardMembers,
  setCardStep,
  sortBoardList,
  transferCard,
  undeleteCard,
  updateBoard,
  updateBoardList,
  updateCard,
} from '../../../lib/admin';

const BIN_KEEP = 12;

export function withCard(board, card) {
  return { ...board, cards: { ...board.cards, [card.id]: card } };
}

export function withCardMoved(board, cardId, listId, index) {
  const lists = board.lists.map((entry) => ({
    ...entry,
    cards: entry.cards.filter((entry_id) => entry_id !== cardId),
  }));
  const landing = lists.find((entry) => entry.id === listId);
  if (landing) landing.cards.splice(Math.max(0, Math.min(index, landing.cards.length)), 0, cardId);
  const held = board.cards[cardId];
  const done = landing?.done ? true : held?.done;
  return { ...board, lists, cards: { ...board.cards, [cardId]: { ...held, list: listId, done } } };
}

export function useActions({ board, setBoard, setError, onGone }) {
  const [busy, setBusy] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState(null);
  const [undo, setUndo] = React.useState(null);
  const live = React.useRef(true);

  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  React.useEffect(() => {
    setUndo(null);
  }, [board?.id]);

  const run = React.useCallback(
    async (work, guess) => {
      const previous = board;
      if (guess) setBoard(guess);
      setBusy(true);
      setError(null);
      try {
        const next = await work();
        if (!live.current) return true;
        if (next) setBoard(next);
        setSavedAt(Date.now());
        return true;
      } catch (failure) {
        if (!live.current) return false;
        if (guess) setBoard(previous);
        setError(failure.message);
        return false;
      } finally {
        if (live.current) setBusy(false);
      }
    },
    [board, setBoard, setError],
  );

  const runCard = React.useCallback(
    (work, guess) => run(async () => withCard(board, await work()), guess),
    [board, run],
  );

  return React.useMemo(
    () => ({
      busy,
      savedAt,
      run,
      undo,
      fail: (message) => setError(message),
      forget: () => setUndo(null),
      board: {
        set: (changes) => run(() => updateBoard(board.id, changes)),
        addMember: (name, role) => run(() => setBoardMember(board.id, name, role)),
        addPeople: (people) => run(() => setBoardMembers(board.id, people)),
        ask: (name, role) => run(() => askBoardMember(board.id, name, role)),
        cancelAsk: (name) => run(() => cancelBoardAsk(board.id, name)),
        setArt: async (kind, data, focus) => setBoard(await setBoardArt(board.id, kind, data, focus)),
        placeArt: async (kind, focus) => setBoard(await placeBoardArt(board.id, kind, focus)),
        dropArt: async (kind) => setBoard(await deleteBoardArt(board.id, kind)),
        dropMember: (name) =>
          run(async () => {
            const result = await removeBoardMember(board.id, name);
            if (result.left) {
              onGone?.();
              return null;
            }
            return result.board;
          }),
        setLabel: (label, name, colour) => run(() => setBoardLabel(board.id, label, name, colour)),
        dropLabel: (label) => run(() => deleteBoardLabel(board.id, label)),
      },
      column: {
        add: (name) => run(() => createBoardList(board.id, name)),
        set: (list, changes) => run(() => updateBoardList(board.id, list, changes)),
        move: (list, index) => run(() => moveBoardList(board.id, list, index)),
        sort: (list, by) => run(() => sortBoardList(board.id, list, by)),
        drop: (list) => run(() => deleteBoardList(board.id, list)),
      },
      card: {
        add: (list, title) => run(async () => (await createCard(board.id, list, title)).board),
        set: (id, changes, guess) =>
          runCard(
            () => updateCard(board.id, id, changes),
            guess === undefined ? withCard(board, { ...board.cards[id], ...changes }) : guess,
          ),
        move: (id, list, index) =>
          run(() => moveCard(board.id, id, list, index), withCardMoved(board, id, list, index)),
        copy: (id) => run(async () => (await duplicateCard(board.id, id)).board),
        drop: (id) =>
          run(async () => {
            const result = await deleteCard(board.id, id);
            setUndo({ cards: [result.undo], what: `Deleted “${result.title}”.` });
            return result.board;
          }),
        restore: (ids) =>
          run(async () => {
            setUndo(null);
            let held = null;
            for (const id of [...ids].reverse()) held = await undeleteCard(board.id, id);
            return held?.board ?? null;
          }),
        bulk: (ids, action, value) =>
          run(async () => {
            const result = await bulkCards(board.id, ids, action, value);
            if (action === 'delete') {
              setUndo({
                cards: ids.slice(-BIN_KEEP),
                what:
                  ids.length === 1
                    ? `Deleted “${board.cards[ids[0]]?.title ?? 'that card'}”.`
                    : `Deleted ${ids.length} cards.`,
              });
            }
            return result.board;
          }),
        sendTo: (id, to, list) =>
          run(async () => {
            const result = await transferCard(board.id, id, to, list);
            setUndo(null);
            return result.board;
          }),
        comment: (id, body) => runCard(() => commentOnCard(board.id, id, body)),
        dropComment: (id, comment) => runCard(() => deleteCardComment(board.id, id, comment)),
        addStep: (id, text) => runCard(() => addCardStep(board.id, id, text)),
        setStep: (id, step, changes) =>
          runCard(() => setCardStep(board.id, id, step, changes), {
            ...board,
            cards: {
              ...board.cards,
              [id]: {
                ...board.cards[id],
                checklist: (board.cards[id]?.checklist ?? []).map((entry) =>
                  entry.id === step ? { ...entry, ...changes } : entry,
                ),
              },
            },
          }),
        dropStep: (id, step) => runCard(() => deleteCardStep(board.id, id, step)),
        addLink: (id, label, url) => runCard(() => addCardLink(board.id, id, label, url)),
        dropLink: (id, link) => runCard(() => deleteCardLink(board.id, id, link)),
        attach: (id, files) =>
          runCard(async () => {
            let held = null;
            for (const item of files) {
              try {
                held = await attachCardFile(board.id, id, item.name, item.data, item.thumb);
              } catch (failure) {
                if (held === null) throw failure;
                setError(failure.message);
                break;
              }
            }
            return held;
          }),
        dropFile: (id, file) => runCard(() => deleteCardFile(board.id, id, file)),
      },
    }),
    [board, busy, savedAt, undo, run, runCard, setBoard, setError, onGone],
  );
}
