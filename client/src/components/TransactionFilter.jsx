import React from 'react';

const TransactionDateFilter = ({
    availableYears,
    availableMonths,
    availableDays,
    selectedYears,
    selectedMonths,
    selectedDays,
    onToggleYear,
    onToggleMonth,
    onToggleDay,
    onApply,
    onClose,
    onReset,
}) => {
    const isMonthDisabled = selectedYears.length === 0;
    const isDayDisabled = selectedMonths.length === 0;

    return (
        <div className="flex flex-col mb-6 p-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-lg space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Filter Transactions by Date</h2>
                <button
                    onClick={onClose}
                    className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-700 text-white"
                >
                    ✖
                </button>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Years */}
                <div>
                    <h3 className="font-semibold text-gray-200 mb-2">Year</h3>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                        {availableYears.map((year) => (
                            <label key={year} className="flex items-center gap-2 text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={selectedYears.includes(year)}
                                    onChange={() => onToggleYear(year)}
                                />
                                {year}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Months */}
                <div>
                    <h3 className="font-semibold text-gray-200 mb-2">Month</h3>
                    <div className={`space-y-1 max-h-40 overflow-y-auto ${isMonthDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                        {availableMonths.map((month) => (
                            <label key={month} className="flex items-center gap-2 text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={selectedMonths.includes(month)}
                                    onChange={() => onToggleMonth(month)}
                                />
                                {month}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Days */}
                <div>
                    <h3 className="font-semibold text-gray-200 mb-2">Day</h3>
                    <div className={`space-y-1 max-h-40 overflow-y-auto ${isDayDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                        {availableDays.map((day) => (
                            <label key={day} className="flex items-center gap-2 text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={selectedDays.includes(day)}
                                    onChange={() => onToggleDay(day)}
                                />
                                {day}
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mt-4">
                <button
                    onClick={onApply}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded-lg"
                >
                    Apply Filters
                </button>
                <button
                    onClick={onReset}
                    className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg"
                >
                    Reset
                </button>
            </div>
        </div>
    );
};

export default TransactionDateFilter;
