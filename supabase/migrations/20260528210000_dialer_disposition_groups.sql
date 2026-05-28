alter table public.leads
  add column if not exists last_disposition_main text,
  add column if not exists last_disposition_sub text;

alter table public.call_logs
  add column if not exists main_disposition text,
  add column if not exists sub_disposition text;

update public.leads
set
  last_disposition_main = coalesce(
    last_disposition_main,
    case last_disposition
      when 'No Answer' then 'NOT_CONNECTED'
      when 'Voicemail' then 'NOT_CONNECTED'
      when 'Busy' then 'NOT_CONNECTED'
      when 'Switched Off' then 'NOT_CONNECTED'
      when 'Not Reachable' then 'NOT_CONNECTED'
      when 'Call Failed' then 'NOT_CONNECTED'
      when 'Failed Attempt' then 'NOT_CONNECTED'
      when 'Disconnected' then 'NOT_CONNECTED'
      when 'Network Issue' then 'NOT_CONNECTED'
      when 'Call Back Later' then 'CALLBACK'
      when 'Follow-Up Required' then 'CALLBACK'
      when 'Appointment Booked' then 'INTERESTED'
      when 'Interested' then 'INTERESTED'
      when 'Not Interested' then 'NOT_INTERESTED'
      when 'Existing Customer' then 'EXISTING_CUSTOMER'
      when 'Wrong Number' then 'INVALID_LEAD'
      when 'DNC' then 'DO_NOT_CALL'
      when 'Sale Closed' then 'CLOSED'
      when 'Already have team' then 'NOT_INTERESTED'
      when 'Already have yelp account' then 'NOT_INTERESTED'
      when 'Not available' then 'NOT_CONNECTED'
      when 'Rpc hung' then 'NOT_CONNECTED'
      when '3rd party hung up' then 'NOT_CONNECTED'
      else null
    end
  ),
  last_disposition_sub = coalesce(
    last_disposition_sub,
    case last_disposition
      when 'No Answer' then 'NO_ANSWER'
      when 'Voicemail' then 'VOICEMAIL'
      when 'Busy' then 'BUSY'
      when 'Switched Off' then 'SWITCHED_OFF'
      when 'Not Reachable' then 'NOT_REACHABLE'
      when 'Call Failed' then 'CALL_FAILED'
      when 'Failed Attempt' then 'CALL_FAILED'
      when 'Disconnected' then 'DISCONNECTED'
      when 'Network Issue' then 'NETWORK_ISSUE'
      when 'Call Back Later' then 'CALL_BACK_LATER'
      when 'Follow-Up Required' then 'FOLLOW_UP_REQUIRED'
      when 'Appointment Booked' then 'MEETING_VISIT_DEMO_SCHEDULED'
      when 'Interested' then 'INTERESTED'
      when 'Not Interested' then 'NOT_INTERESTED_OTHER'
      when 'Existing Customer' then 'EXISTING_CUSTOMER'
      when 'Wrong Number' then 'WRONG_NUMBER'
      when 'DNC' then 'DO_NOT_CALL'
      when 'Sale Closed' then 'WON'
      when 'Already have team' then 'ALREADY_HAVE_VENDOR_SERVICE'
      when 'Already have yelp account' then 'ALREADY_HAVE_VENDOR_SERVICE'
      when 'Not available' then 'NOT_REACHABLE'
      when 'Rpc hung' then 'DISCONNECTED'
      when '3rd party hung up' then 'DISCONNECTED'
      else null
    end
  )
where last_disposition is not null;

update public.call_logs
set
  main_disposition = coalesce(
    main_disposition,
    case disposition
      when 'No Answer' then 'NOT_CONNECTED'
      when 'Voicemail' then 'NOT_CONNECTED'
      when 'Busy' then 'NOT_CONNECTED'
      when 'Switched Off' then 'NOT_CONNECTED'
      when 'Not Reachable' then 'NOT_CONNECTED'
      when 'Call Failed' then 'NOT_CONNECTED'
      when 'Failed Attempt' then 'NOT_CONNECTED'
      when 'Disconnected' then 'NOT_CONNECTED'
      when 'Network Issue' then 'NOT_CONNECTED'
      when 'Call Back Later' then 'CALLBACK'
      when 'Follow-Up Required' then 'CALLBACK'
      when 'Appointment Booked' then 'INTERESTED'
      when 'Interested' then 'INTERESTED'
      when 'Not Interested' then 'NOT_INTERESTED'
      when 'Existing Customer' then 'EXISTING_CUSTOMER'
      when 'Wrong Number' then 'INVALID_LEAD'
      when 'DNC' then 'DO_NOT_CALL'
      when 'Sale Closed' then 'CLOSED'
      when 'Already have team' then 'NOT_INTERESTED'
      when 'Already have yelp account' then 'NOT_INTERESTED'
      when 'Not available' then 'NOT_CONNECTED'
      when 'Rpc hung' then 'NOT_CONNECTED'
      when '3rd party hung up' then 'NOT_CONNECTED'
      else null
    end
  ),
  sub_disposition = coalesce(
    sub_disposition,
    case disposition
      when 'No Answer' then 'NO_ANSWER'
      when 'Voicemail' then 'VOICEMAIL'
      when 'Busy' then 'BUSY'
      when 'Switched Off' then 'SWITCHED_OFF'
      when 'Not Reachable' then 'NOT_REACHABLE'
      when 'Call Failed' then 'CALL_FAILED'
      when 'Failed Attempt' then 'CALL_FAILED'
      when 'Disconnected' then 'DISCONNECTED'
      when 'Network Issue' then 'NETWORK_ISSUE'
      when 'Call Back Later' then 'CALL_BACK_LATER'
      when 'Follow-Up Required' then 'FOLLOW_UP_REQUIRED'
      when 'Appointment Booked' then 'MEETING_VISIT_DEMO_SCHEDULED'
      when 'Interested' then 'INTERESTED'
      when 'Not Interested' then 'NOT_INTERESTED_OTHER'
      when 'Existing Customer' then 'EXISTING_CUSTOMER'
      when 'Wrong Number' then 'WRONG_NUMBER'
      when 'DNC' then 'DO_NOT_CALL'
      when 'Sale Closed' then 'WON'
      when 'Already have team' then 'ALREADY_HAVE_VENDOR_SERVICE'
      when 'Already have yelp account' then 'ALREADY_HAVE_VENDOR_SERVICE'
      when 'Not available' then 'NOT_REACHABLE'
      when 'Rpc hung' then 'DISCONNECTED'
      when '3rd party hung up' then 'DISCONNECTED'
      else null
    end
  )
where disposition is not null;
