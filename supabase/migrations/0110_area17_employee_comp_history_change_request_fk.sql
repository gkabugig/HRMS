alter table employee_compensation_history
  add constraint employee_compensation_history_change_request_id_fkey
    foreign key (change_request_id) references compensation_change_requests(id);
