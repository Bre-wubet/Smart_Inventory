/**
 * Date and Time Utilities
 * 
 * Comprehensive date and time manipulation functions for
 * business calculations, reporting, and scheduling
 */

function formatDate(date, format = 'ISO') {
  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  switch (format) {
    case 'ISO':
      return d.toISOString();
    case 'US':
      return `${month}/${day}/${year}`;
    case 'EU':
      return `${day}/${month}/${year}`;
    case 'ISO_DATE':
      return `${year}-${month}-${day}`;
    case 'ISO_DATETIME':
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    case 'READABLE':
      return d.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    case 'READABLE_DATETIME':
      return d.toLocaleString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    default:
      return d.toISOString();
  }
}

function calculateDateDifference(startDate, endDate, unit = 'days') {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date provided');
  }

  const diffMs = end - start;
  
  switch (unit) {
    case 'milliseconds':
      return diffMs;
    case 'seconds':
      return Math.floor(diffMs / 1000);
    case 'minutes':
      return Math.floor(diffMs / (1000 * 60));
    case 'hours':
      return Math.floor(diffMs / (1000 * 60 * 60));
    case 'days':
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    case 'weeks':
      return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
    case 'months':
      return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44)); // Average month length
    case 'years':
      return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25)); // Account for leap years
    default:
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}

function addTime(date, amount, unit = 'days') {
  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  switch (unit) {
    case 'milliseconds':
      return new Date(d.getTime() + amount);
    case 'seconds':
      return new Date(d.getTime() + (amount * 1000));
    case 'minutes':
      return new Date(d.getTime() + (amount * 1000 * 60));
    case 'hours':
      return new Date(d.getTime() + (amount * 1000 * 60 * 60));
    case 'days':
      return new Date(d.getTime() + (amount * 1000 * 60 * 60 * 24));
    case 'weeks':
      return new Date(d.getTime() + (amount * 1000 * 60 * 60 * 24 * 7));
    case 'months':
      return new Date(d.getFullYear(), d.getMonth() + amount, d.getDate());
    case 'years':
      return new Date(d.getFullYear() + amount, d.getMonth(), d.getDate());
    default:
      return new Date(d.getTime() + (amount * 1000 * 60 * 60 * 24));
  }
}

function getPeriodBounds(date, period = 'day') {
  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();

  switch (period) {
    case 'day':
      return {
        start: new Date(year, month, day, 0, 0, 0, 0),
        end: new Date(year, month, day, 23, 59, 59, 999)
      };
    
    case 'week':
      const startOfWeek = new Date(d);
      startOfWeek.setDate(day - d.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      
      return { start: startOfWeek, end: endOfWeek };
    
    case 'month':
      return {
        start: new Date(year, month, 1, 0, 0, 0, 0),
        end: new Date(year, month + 1, 0, 23, 59, 59, 999)
      };
    
    case 'quarter':
      const quarterStartMonth = Math.floor(month / 3) * 3;
      return {
        start: new Date(year, quarterStartMonth, 1, 0, 0, 0, 0),
        end: new Date(year, quarterStartMonth + 3, 0, 23, 59, 59, 999)
      };
    
    case 'year':
      return {
        start: new Date(year, 0, 1, 0, 0, 0, 0),
        end: new Date(year, 11, 31, 23, 59, 59, 999)
      };
    
    default:
      return {
        start: new Date(year, month, day, 0, 0, 0, 0),
        end: new Date(year, month, day, 23, 59, 59, 999)
      };
  }
}

function calculateBusinessDays(startDate, endDate, holidays = []) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date provided');
  }

  if (start > end) {
    return 0;
  }

  let businessDays = 0;
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
    const isHoliday = holidays.some(holiday => 
      new Date(holiday).toDateString() === current.toDateString()
    );
    
    if (!isWeekend && !isHoliday) {
      businessDays++;
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return businessDays;
}

function generateDateRange(startDate, endDate, interval = 'day') {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date provided');
  }

  const dates = [];
  const current = new Date(start);
  
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
    
    // Adjust for different intervals
    switch (interval) {
      case 'week':
        current.setDate(current.getDate() + 6);
        break;
      case 'month':
        current.setMonth(current.getMonth() + 1);
        break;
      case 'year':
        current.setFullYear(current.getFullYear() + 1);
        break;
    }
  }
  
  return dates;
}

function calculateAge(birthDate, referenceDate = new Date(), unit = 'years') {
  const birth = new Date(birthDate);
  const reference = new Date(referenceDate);
  
  if (isNaN(birth.getTime()) || isNaN(reference.getTime())) {
    throw new Error('Invalid date provided');
  }

  if (birth > reference) {
    throw new Error('Birth date cannot be in the future');
  }

  return calculateDateDifference(birth, reference, unit);
}

function isWithinBusinessHours(date, businessHours = {}) {
  const {
    startHour = 9,
    endHour = 17,
    startMinute = 0,
    endMinute = 0,
    workingDays = [1, 2, 3, 4, 5] // Monday to Friday
  } = businessHours;

  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  const dayOfWeek = d.getDay();
  const hour = d.getHours();
  const minute = d.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  const startTimeInMinutes = startHour * 60 + startMinute;
  const endTimeInMinutes = endHour * 60 + endMinute;

  return workingDays.includes(dayOfWeek) && 
         timeInMinutes >= startTimeInMinutes && 
         timeInMinutes <= endTimeInMinutes;
}

function getNextBusinessDay(date, holidays = []) {
  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  do {
    d.setDate(d.getDate() + 1);
  } while (
    d.getDay() === 0 || d.getDay() === 6 || // Weekend
    holidays.some(holiday => new Date(holiday).toDateString() === d.toDateString())
  );

  return d;
}

function getPreviousBusinessDay(date, holidays = []) {
  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  do {
    d.setDate(d.getDate() - 1);
  } while (
    d.getDay() === 0 || d.getDay() === 6 || // Weekend
    holidays.some(holiday => new Date(holiday).toDateString() === d.toDateString())
  );

  return d;
}

function getTimezoneOffset(date, timezone = 'UTC') {
  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  // This is a simplified implementation
  // In production, use a proper timezone library like moment-timezone
  const utc = new Date(d.getTime() + (d.getTimezoneOffset() * 60000));
  const offset = d.getTimezoneOffset();
  
  return {
    offset: offset,
    offsetHours: Math.abs(offset) / 60,
    offsetString: `${offset < 0 ? '+' : '-'}${Math.abs(offset) / 60}`,
    timezone: timezone,
    utc: utc,
    local: d
  };
}

function getFiscalYear(date, fiscalYearStartMonth = 0) {
  const d = new Date(date);
  
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date provided');
  }

  const year = d.getFullYear();
  const month = d.getMonth();
  
  let fiscalYear = year;
  if (month < fiscalYearStartMonth) {
    fiscalYear = year - 1;
  }

  const fiscalYearStart = new Date(fiscalYear, fiscalYearStartMonth, 1);
  const fiscalYearEnd = new Date(fiscalYear + 1, fiscalYearStartMonth, 0, 23, 59, 59, 999);

  return {
    fiscalYear,
    fiscalYearStart,
    fiscalYearEnd,
    fiscalQuarter: Math.floor((month - fiscalYearStartMonth + 12) % 12 / 3) + 1,
    fiscalMonth: ((month - fiscalYearStartMonth + 12) % 12) + 1
  };
}

function calculateWorkingHours(startDate, endDate, businessHours = {}) {
  const {
    startHour = 9,
    endHour = 17,
    workingDays = [1, 2, 3, 4, 5] // Monday to Friday
  } = businessHours;

  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date provided');
  }

  let workingHours = 0;
  const current = new Date(start);
  
  while (current < end) {
    const dayOfWeek = current.getDay();
    
    if (workingDays.includes(dayOfWeek)) {
      const dayStart = new Date(current);
      dayStart.setHours(startHour, 0, 0, 0);
      
      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, 0, 0, 0);
      
      const effectiveStart = new Date(Math.max(start.getTime(), dayStart.getTime()));
      const effectiveEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()));
      
      if (effectiveStart < effectiveEnd) {
        workingHours += (effectiveEnd - effectiveStart) / (1000 * 60 * 60);
      }
    }
    
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }
  
  return Math.round(workingHours * 100) / 100;
}

module.exports = {
  formatDate,
  calculateDateDifference,
  addTime,
  getPeriodBounds,
  calculateBusinessDays,
  generateDateRange,
  calculateAge,
  isWithinBusinessHours,
  getNextBusinessDay,
  getPreviousBusinessDay,
  getTimezoneOffset,
  getFiscalYear,
  calculateWorkingHours
};
