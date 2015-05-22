{div, ul, li, span, i, button, input} = React.DOM
{Tooltips} = require '../constants/app_constants'


momentFormat     = 'DD/MM/YYYY'
datePickerFormat = '%d/%m/%Y'


module.exports = DateRangePicker = React.createClass
    displayName: 'DateRangePicker'

    propTypes:
        onDateFilter: React.PropTypes.func.isRequired

    getInitialState: ->
        label:     t 'daterangepicker placeholder'
        startDate: ''
        endDate:   ''


    onStartChange: (obj) ->
        date = if obj.target? then obj.target.value else
                                  "#{obj.dd}/#{obj.mm}/#{obj.yyyy}"
        @setState startDate: date, @filterize


    onEndChange: (obj) ->
        date = if obj.target then obj.target.value else
                                  "#{obj.dd}/#{obj.mm}/#{obj.yyyy}"
        @setState endDate: date, @filterize


    filterize: ->
        return if !@state.startDate ^ !@state.endDate

        start = if @state.startDate
            [d, m, y] = @state.startDate.split '/'
            "#{y}-#{m}-#{d}T00:00:00.000Z"

        end = if @state.endDate
            [d, m, y] = @state.endDate.split '/'
            "#{y}-#{m}-#{d}T23:59:59.999Z"

        @props.onDateFilter start, end


    reset: ->
        @setState
            startDate: ''
            endDate:   '',
            @filterize


    presetYesterday: ->
        @setState
            startDate: moment().subtract(1, 'day').format(momentFormat)
            endDate:   moment().subtract(1, 'day').format(momentFormat),
            @filterize


    presetLastWeek: ->
        @setState
            startDate: moment().subtract(1, 'week').format(momentFormat)
            endDate:   moment().format(momentFormat),
            @filterize


    presetLastMonth: ->
        @setState
            startDate: moment().subtract(1, 'month').format(momentFormat)
            endDate:   moment().format(momentFormat),
            @filterize


    render: ->
        div
            className:                'dropdown date-range-picker'
            'aria-describedby':       Tooltips.FILTER_DATE_RANGE
            'data-tooltip-direction': 'bottom'

            button
                className:       'dropdown-toggle'
                role:            'menuitem'
                'data-toggle':   'dropdown'
                'aria-selected': !!@state.startDate and !!@state.endDate

                i className: 'fa fa-calendar'
                span className: 'btn-label',
                    "#{@state.label} "
                span className: 'caret'

            div className: 'dropdown-menu',
                ul className: 'presets list-unstyled',
                    li role: 'presentation',
                        button
                            role:    'menuitem'
                            onClick: @presetYesterday
                            t 'daterangepicker presets yesterday'

                    li role: 'presentation',
                        button
                            role:    'menuitem'
                            onClick: @presetLastWeek
                            t 'daterangepicker presets last week'

                    li role: 'presentation',
                        button
                            role:    'menuitem'
                            onClick: @presetLastMonth
                            t 'daterangepicker presets last month'

                    li role: 'presentation',
                        button
                            role:    'menuitem'
                            onClick: @reset
                            t 'daterangepicker clear'

                div className: 'date-pickers',
                    input
                        ref:      "date-range-picker-start"
                        id:       "date-range-picker-start"
                        type:     'text'
                        name:     "date-range-picker-start"
                        value:    @state.startDate
                        onChange: @onStartChange

                    input
                        ref:      "date-range-picker-end"
                        id:       "date-range-picker-end"
                        type:     'text'
                        name:     "date-range-picker-end"
                        value:    @state.endDate
                        onChange: @onEndChange


    # Add third party datepicker to start and end date fields
    initDatepicker: ->
        options =
            staticPos: true
            fillGrid:  true
            hideInput: true

        datePickerController.createDatePicker _.extend {}, options,
            formElements: 'date-range-picker-start': datePickerFormat
            callbackFunctions: datereturned: [@onStartChange]

        datePickerController.createDatePicker _.extend {}, options,
            formElements: 'date-range-picker-end': datePickerFormat
            callbackFunctions: datereturned: [@onEndChange]


    componentDidMount: ->
        @initDatepicker()

    componentDidUpdate: ->
        datePickerController.setDateFromInput 'date-range-picker-start'
        datePickerController.setDateFromInput 'date-range-picker-end'
