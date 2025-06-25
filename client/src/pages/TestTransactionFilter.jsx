import React, { useState } from 'react';
import TransactionDateFilter from '../components/TransactionFilter';

const TestTransactionFilter = () => {
  const years = [2023, 2024, 2025];
  const months = ['January', 'February', 'March', 'April'];
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedDays, setSelectedDays] = useState([]);

  const toggleYear = (year) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  };

  const toggleMonth = (month) => {
    setSelectedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
    );
  };

  const toggleDay = (day) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const applyFilters = () => {
    console.log('Applied Filters:', {
      selectedYears,
      selectedMonths,
      selectedDays,
    });
  };

  const closeFilter = () => {
    setSelectedYears([]);
    setSelectedMonths([]);
    setSelectedDays([]);
  };

  return (
    <div className="p-8 bg-sky-950 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6">Filter Tester</h1>
      <TransactionDateFilter
  availableYears={[2023, 2024, 2025]}
  availableMonths={['January', 'February', 'March', 'April']}
  availableDays={[1, 2, 3, 4, 5, 6, 7]}
  selectedYears={selectedYears}
  selectedMonths={selectedMonths}
  selectedDays={selectedDays}
  onToggleYear={toggleYear}
  onToggleMonth={toggleMonth}
  onToggleDay={toggleDay}
  onApply={applyFilters}
  onClose={() => setShowFilter(false)}
  onReset={resetFilters}
/>
    </div>
  );
};

export default TestTransactionFilter;
