import copy
import threading

from admin_store import StoreError
from admin_store_firebase import valid_doc_id


class MemoryDb:

    def __init__(self):
        self.data = {}
        self.seq = 0
        self.lock = threading.RLock()

    def _col(self, collection):
        return self.data.setdefault(collection, {})

    def get(self, collection, doc_id):
        if not valid_doc_id(doc_id):
            return None
        with self.lock:
            value = self._col(collection).get(doc_id)
            return copy.deepcopy(value) if isinstance(value, dict) else None

    def set(self, collection, doc_id, data):
        if not valid_doc_id(doc_id):
            raise StoreError("That name is reserved.")
        with self.lock:
            self._col(collection)[doc_id] = copy.deepcopy(data)

    def delete(self, collection, doc_id):
        with self.lock:
            self._col(collection).pop(doc_id, None)

    def list(self, collection):
        with self.lock:
            return [(key, copy.deepcopy(value)) for key, value in self._col(collection).items()]

    def add(self, collection, data):
        with self.lock:
            self.seq += 1
            doc_id = "auto-%08d" % self.seq
            self._col(collection)[doc_id] = copy.deepcopy(data)
            return doc_id

    def tail(self, collection, order_field, limit):
        with self.lock:
            rows = [copy.deepcopy(value) for value in self._col(collection).values()]
        rows.sort(key=lambda row: row.get(order_field) or 0, reverse=True)
        return rows[:limit]

    def transact(self, collection, doc_id, mutate):
        if not valid_doc_id(doc_id):
            raise StoreError("That name is reserved.")
        with self.lock:
            current = self._col(collection).get(doc_id)
            snapshot = copy.deepcopy(current) if isinstance(current, dict) else None
            new_data, result = mutate(snapshot)
            if new_data is None:
                self._col(collection).pop(doc_id, None)
            else:
                self._col(collection)[doc_id] = copy.deepcopy(new_data)
            return result
