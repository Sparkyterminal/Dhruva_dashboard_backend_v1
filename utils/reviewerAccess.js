/**
 * THE reviewer rule, shared by Everyday Expenses and Employee Statistics. Never re-implement it.
 *
 * A reviewer is a user whose role is CA, APPROVER or OWNER, or any of whose active,
 * non-archived departments is named "HR DEPARTMENT" or "HR" (trimmed, repeated spaces
 * collapsed, case-insensitive). ADMIN is never a reviewer. Role and departments always come
 * from the database, never from the token or the e-mail address.
 * To make another role a reviewer (e.g. ACCOUNTS), add it to REVIEWER_ROLES.
 */
const User = require('../Modals/User');
const Department = require('../Modals/Department');

const REVIEWER_ROLES = ['CA', 'APPROVER', 'OWNER'];
const REVIEWER_DEPARTMENT_NAMES = ['HR', 'HR DEPARTMENT'];

/** Trim, collapse repeated spaces, upper-case: " hr  department " → "HR DEPARTMENT". */
function normDepartmentName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** @param {{ role: string, departmentNames: string[] }} user */
function isExpenseReviewer({ role, departmentNames } = {}) {
  if (role === 'ADMIN') return false;
  if (REVIEWER_ROLES.includes(role)) return true;
  return (departmentNames || []).some((n) => REVIEWER_DEPARTMENT_NAMES.includes(normDepartmentName(n)));
}

function titleCase(s) {
  return String(s || '').replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function displayName(user) {
  return titleCase(`${user?.first_name || ''} ${user?.last_name || ''}`.trim());
}

/**
 * Loads the caller for access checks.
 * @returns {Promise<null | { id, objectId, name, role, departments, isReviewer }>} null when the
 *          user does not exist, is inactive or archived.
 */
async function loadUserAccess(userId) {
  const user = await User.findById(userId)
    .select('first_name last_name role department is_active is_archived')
    .lean();
  if (!user || user.is_active === false || user.is_archived === true) return null;
  const deptIds = Array.isArray(user.department?.department) ? user.department.department : [];
  const depts = deptIds.length
    ? await Department.find({ _id: { $in: deptIds }, is_active: true, is_archived: false }).select('name').lean()
    : [];
  const departments = depts.map((d) => String(d.name || '').trim()).filter(Boolean);
  return {
    id: String(user._id),
    objectId: user._id,
    name: displayName(user),
    role: user.role,
    departments,
    isReviewer: isExpenseReviewer({ role: user.role, departmentNames: departments }),
  };
}

module.exports = {
  REVIEWER_ROLES,
  REVIEWER_DEPARTMENT_NAMES,
  normDepartmentName,
  isExpenseReviewer,
  displayName,
  loadUserAccess,
};
