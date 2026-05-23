# Security Specification for VoiceOps

## 1. Data Invariants
- An inventory item must have a valid `name` (string), `qty` (integer >= 0), and a `category` (string).
- An order must have a valid table identifier `meja` (string), a non-empty list of `items` containing valid counts, and a state of `status` (either `"active"` or `"completed"`).
- Since all order creations and inventory updates are performed by the backend server via Firebase Admin SDK (which bypasses rules), the client should only have `read` access to synchronize UI state. Direct client-side writes are blocked to protect data integrity.

## 2. The "Dirty Dozen" Payloads (Designed to Fail Client-Side Writes)
Here are 12 malicious payloads that client-side users could try to write, all of which must be blocked and return `PERMISSION_DENIED`.

1. **Spoofed Order Creation**: Direct client-side creation of a fake order.
2. **Infinite Stock Injection**: Client attempts to set inventory item `qty` to `999999`.
3. **Negative Stock Hack**: Client setting inventory item `qty` to `-5` to crash subtraction calculations.
4. **Invalid Order Status**: Setting `status` of an order to `"unknown_status"`.
5. **Malicious ID Injection**: Creating an inventory item with a 1.5KB long ID to cause billing bloat.
6. **SQL/NoSQL Code Injection**: Passing an object containing nested database rules as the `name`.
7. **Empty Order Items**: Creating an order with an empty item list.
8. **Missing Required Fields**: Creating an order without the `meja` field.
9. **Tampering with Status**: Client trying to resolve an active order directly bypassing validation.
10. **Zero Quantity Order Item**: Ordering 0 quantity of an item.
11. **Type Poisoning**: Sending `qty` as a string `"ten"` instead of an integer.
12. **Field Addition Attack**: Adding unapproved keys like `isGlobalAdmin: true` to a document.

## 3. Test Runner
We don't need to run tests locally in this specific sandbox since we use Firebase Admin SDK server-side, but the security rules will prevent all direct client-side modifications.
